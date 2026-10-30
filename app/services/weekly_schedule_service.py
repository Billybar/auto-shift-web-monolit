import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Dict, Iterable, List, Sequence, Set, Tuple

from pydantic import TypeAdapter
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core import config, models, schemas, shift_timing
from app.core.constants import DEFAULT_LOCATION_WEIGHTS
from app.core.enums import ErrorCode, ShiftCategory
from app.core.errors import AppError
from app.engine.employee_history import EmployeeHistoricalState
from app.engine.schedule_checker import CheckIssue, Placement, check_schedule
from app.engine.solver import ShiftOptimizer
from app.services import assignment_sync_service, shift_demand_service

logger = logging.getLogger(__name__)


def _days_back(dates: Set[date], last_day: date, first_day: date) -> int:
    """How many days in a row, counted back from last_day and not before first_day, are in `dates`."""
    count = 0
    day = last_day
    while day >= first_day and day in dates:
        count += 1
        day -= timedelta(days=1)
    return count


def calculate_historical_states(
    db: Session, location_id: int, start_date: date, honor_overrides: bool = False
) -> Dict[int, EmployeeHistoricalState]:
    """
    Calculates the historical state of all employees in a given location from the 7 days
    preceding the start_date: the streak of worked days, the nights worked in a row at the end,
    and when their last shift ended. Read from the shifts' hours, not their names.
    With honor_overrides, a row's own start/end time (when set) gives when it ended.
    Raises InvalidShiftHours for a shift whose hours are invalid.
    """
    history_start = start_date - timedelta(days=7)
    history_end = start_date - timedelta(days=1)

    stmt = select(models.Assignment).options(
        joinedload(models.Assignment.shift_def)
    ).where(
        models.Assignment.location_id == location_id,
        models.Assignment.date >= history_start,
        models.Assignment.date <= history_end
    )
    assignments = db.execute(stmt).scalars().all()
    timings = shift_timing.build_timings({a.shift_def for a in assignments})

    emp_assignments: Dict[int, List[models.Assignment]] = {}
    for assignment in assignments:
        emp_assignments.setdefault(assignment.employee_id, []).append(assignment)

    def end_of(a: models.Assignment) -> int:
        timing = timings[a.shift_id]
        if honor_overrides:
            return shift_timing.placement_span(timing, a.start_time, a.end_time)[1]
        return timing.end

    states: Dict[int, EmployeeHistoricalState] = {}

    for emp_id, worked in emp_assignments.items():
        worked_dates = {a.date for a in worked}
        night_dates = {a.date for a in worked if timings[a.shift_id].category == ShiftCategory.NIGHT}
        # In minutes from 00:00 of start_date, so a Saturday night shift ending at 07:00 gives +420
        last_shift_end = max(
            (a.date - start_date).days * shift_timing.MINUTES_PER_DAY + end_of(a) for a in worked
        )

        states[emp_id] = EmployeeHistoricalState(
            employee_id=emp_id,
            history_streak=_days_back(worked_dates, history_end, history_start),
            trailing_nights=_days_back(night_dates, history_end, history_start),
            last_shift_end=last_shift_end,
        )

    return states

NUM_DAYS = 7


@dataclass
class WeekInputs:
    """Everything the engine (and the schedule checker) reads for one week of a location."""
    employees: List[models.Employee]
    shifts: List[models.ShiftDefinition]
    weights: models.LocationWeights
    # (shift_id, day_idx, position_id) -> required employees
    demand: Dict[Tuple[int, int, int], int]
    employee_positions: Dict[int, Set[int]]
    primary_position: Dict[int, int]
    settings: Dict[int, models.EmployeeSettings]
    # dicts with employee_id, day_idx, shift_ids, type (see ShiftOptimizer)
    parsed_constraints: List[dict]
    states: Dict[int, EmployeeHistoricalState]


def _load_week_inputs(
    db: Session,
    location_id: int,
    start_date: date,
    extra_employee_ids: Iterable[int] = (),
    require_staff: bool = True,
    honor_overrides: bool = False,
) -> WeekInputs:
    """
    Loads the week's inputs for the location's active employees, plus `extra_employee_ids`
    (employees who left but are still on the board).
    With require_staff, raises SCHEDULE_NO_ACTIVE_EMPLOYEES / SCHEDULE_NO_STAFFABLE_EMPLOYEES when
    there is no one to schedule. Raises SHIFT_INVALID_HOURS for a shift with invalid hours.
    honor_overrides is passed on to calculate_historical_states.
    """
    end_date = start_date + timedelta(days=NUM_DAYS - 1)

    location = db.execute(select(models.Location).where(models.Location.id == location_id)).scalar_one_or_none()
    if not location:
        raise AppError(ErrorCode.LOCATION_NOT_FOUND, f"Location with ID {location_id} not found", status_code=404)

    # Active employees with their settings and roles
    extra_ids = set(extra_employee_ids)
    wanted = and_(models.Employee.location_id == location_id, models.Employee.is_active == True)
    stmt_emp = (
        select(models.Employee)
        .options(selectinload(models.Employee.settings), selectinload(models.Employee.position_links))
        .where(or_(wanted, models.Employee.id.in_(extra_ids)) if extra_ids else wanted)
    )
    employees = list(db.execute(stmt_emp).scalars().all())
    if require_staff and not employees:
        raise AppError(
            ErrorCode.SCHEDULE_NO_ACTIVE_EMPLOYEES,
            "No active employees found for this location",
            status_code=409,
        )

    # Archived roles are ignored: no demand, and an employee can't be placed in them
    active_position_ids = set(db.execute(
        select(models.Position.id).where(models.Position.location_id == location_id, models.Position.is_active.is_(True))
    ).scalars().all())
    employee_positions: Dict[int, Set[int]] = {}
    primary_position: Dict[int, int] = {}
    for emp in employees:
        employee_positions[emp.id] = {link.position_id for link in emp.position_links if link.position_id in active_position_ids}
        if emp.primary_position_id in active_position_ids:
            primary_position[emp.id] = emp.primary_position_id
    if require_staff and not any(employee_positions.values()):
        raise AppError(
            ErrorCode.SCHEDULE_NO_STAFFABLE_EMPLOYEES,
            "No active employee holds an active role in this location",
            status_code=409,
        )

    # Shifts in the order of the work day; the rules read their hours, not their order
    shifts = sorted(
        db.execute(
            select(models.ShiftDefinition).where(models.ShiftDefinition.location_id == location_id)
        ).scalars().all(),
        key=shift_timing.display_key,
    )
    # Every rule reads the shifts' hours, so a shift with invalid hours stops the run before the
    # solver; the carryover from the previous week reads them too
    try:
        shift_timing.build_timings(shifts)
        calculated_states = calculate_historical_states(db, location_id, start_date, honor_overrides=honor_overrides)
    except shift_timing.InvalidShiftHours as e:
        raise AppError(
            ErrorCode.SHIFT_INVALID_HOURS,
            f"Shift {e.shift_id} has invalid hours; set an HH:MM start and end time that differ",
            status_code=409,
            params={"shift_id": e.shift_id, "shift_name": e.shift_name},
        ) from e

    demand_map = shift_demand_service.resolve_demand(db, location_id, start_date, end_date)
    demand = {(s_id, (d - start_date).days, p_id): cell.required for (s_id, d, p_id), cell in demand_map.items()}

    weights = db.execute(
        select(models.LocationWeights).where(models.LocationWeights.location_id == location_id)
    ).scalar_one_or_none()
    if not weights:
        # Every location created through the API has a row; this covers locations inserted directly (e.g. seed)
        logger.warning(f"No weights row for location {location_id}, using the default weights")
        weights = models.LocationWeights(location_id=location_id, **DEFAULT_LOCATION_WEIGHTS)

    emp_settings_dict = {emp.id: emp.settings for emp in employees if emp.settings is not None}

    # --- Weekly Constraints (employee requests/blocks), as day indexes (0-6) for OR-Tools ---
    emp_ids = [e.id for e in employees]
    db_constraints = db.execute(
        select(models.WeeklyConstraint).where(
            models.WeeklyConstraint.employee_id.in_(emp_ids),
            models.WeeklyConstraint.date >= start_date,
            models.WeeklyConstraint.date <= end_date,
        )
    ).scalars().all()
    # Each row covers a constraints-board row: expand it to the group's current shifts in this location
    shifts_by_group: Dict[int, List[int]] = {}
    for s in shifts:
        shifts_by_group.setdefault(s.constraint_group_id, []).append(s.id)
    parsed_constraints = [
        {
            "employee_id": c.employee_id,
            "day_idx": (c.date - start_date).days,
            "shift_ids": shifts_by_group[c.group_id],
            # The exact enum value (e.g., 'must_work', 'cannot_work')
            "type": c.constraint_type,
        }
        for c in db_constraints
        # A group without shifts here (kept as history, or the employee moved location) applies to nothing
        if c.group_id in shifts_by_group
    ]

    # --- Employee States (carryover from the previous week, calculated above) ---
    employee_states_dict = {
        emp.id: calculated_states.get(emp.id) or EmployeeHistoricalState(employee_id=emp.id) for emp in employees
    }

    return WeekInputs(
        employees=employees,
        shifts=shifts,
        weights=weights,
        demand=demand,
        employee_positions=employee_positions,
        primary_position=primary_position,
        settings=emp_settings_dict,
        parsed_constraints=parsed_constraints,
        states=employee_states_dict,
    )


def generate_weekly_schedule(db: Session, location_id: int, start_date: date) -> schemas.AutoScheduleResponse:
    """
    Orchestrates the schedule process:
    1. Fetch data from DB
    2. Run Solver
    3. Return the draft (nothing is saved; the client saves it through Smart Sync)
    """
    num_days = NUM_DAYS

    # --- 1. Fetch Data ---
    inputs = _load_week_inputs(db, location_id, start_date)

    # --- 2. Run Engine ---
    logger.info(f"Starting optimization for location {location_id} with {len(inputs.employees)} employees")
    optimizer = ShiftOptimizer(
        employees=inputs.employees,
        shifts=inputs.shifts,
        weights=inputs.weights,
        demand=inputs.demand,
        employee_positions=inputs.employee_positions,
        primary_position=inputs.primary_position,
        weekly_constraints=inputs.parsed_constraints,
        num_days=num_days,
        max_time_seconds=config.SOLVER_MAX_SECONDS,
        num_workers=config.SOLVER_NUM_WORKERS,
    )
    result = optimizer.solve(inputs.settings, inputs.states)
    logger.info(
        f"Optimization finished: {result.status}, penalty {result.penalty}, "
        f"unfilled slots {sum(u.missing for u in result.unfilled)}"
    )

    # --- 3. Map the result ---
    def day(idx: int) -> date:
        return start_date + timedelta(days=idx)

    warnings: List[schemas.AutoScheduleWarning] = [
        schemas.EmployeeSkippedWarning(employee_id=emp_id) for emp_id in result.skipped_employee_ids
    ]
    warnings += [
        schemas.MustWorkIgnoredWarning(employee_id=i.employee_id, shift_id=i.shift_id, date=day(i.day_idx))
        for i in result.ignored_must_work
    ]
    warnings += [
        schemas.MinShiftsLoweredWarning(employee_id=m.employee_id, requested=m.requested, applied=m.applied)
        for m in result.lowered_min_shifts
    ]

    return schemas.AutoScheduleResponse(
        status=result.status,
        failure_reason=result.failure_reason,
        penalty_score=result.penalty,
        draft_assignments=[
            schemas.DraftAssignment(
                location_id=location_id,
                employee_id=a.employee_id,
                shift_id=a.shift_id,
                position_id=a.position_id,
                date=day(a.day_idx),
            )
            for a in sorted(result.assignments, key=lambda a: (a.day_idx, a.shift_id, a.position_id, a.employee_id))
        ],
        unfilled_slots=[
            schemas.UnfilledSlot(shift_id=u.shift_id, position_id=u.position_id, date=day(u.day_idx), missing=u.missing)
            for u in sorted(result.unfilled, key=lambda u: (u.day_idx, u.shift_id, u.position_id))
        ],
        warnings=warnings,
    )


_violation_adapter = TypeAdapter(schemas.ScheduleViolation)


def _issue_payload(issue: CheckIssue, start_date: date) -> dict:
    """A checker issue as the fields of its response model (day indexes become dates)."""
    payload = {
        "code": issue.code,
        "employee_id": issue.employee_id,
        "cells": [{"shift_id": s, "date": start_date + timedelta(days=d)} for s, d in issue.cells],
        "shift_ids": list(issue.shift_ids),
        "from_previous_week": issue.from_previous_week,
    }
    if issue.day_idx is not None:
        payload["date"] = start_date + timedelta(days=issue.day_idx)
    for name in ("shift_id", "position_id", "rest_minutes", "days", "count", "limit"):
        value = getattr(issue, name)
        if value is not None:
            payload[name] = value
    return payload


def check_weekly_schedule(
    db: Session, location_id: int, start_date: date, items: Sequence[schemas.AssignmentCreate]
) -> schemas.ScheduleCheckResponse:
    """
    Checks the week's board as sent (unsaved edits included) against the engine's hard rules.
    Writes nothing. Raises SyncValidationError for a payload Smart Sync would reject, and
    SHIFT_INVALID_HOURS for a shift with invalid hours.
    """
    end_date = start_date + timedelta(days=NUM_DAYS - 1)
    existing = db.execute(
        select(models.Assignment).where(
            models.Assignment.location_id == location_id,
            models.Assignment.date >= start_date,
            models.Assignment.date <= end_date,
        )
    ).scalars().all()
    existing_map = {(a.employee_id, a.shift_id, a.date): a for a in existing}
    assignment_sync_service.validate_items(db, location_id, start_date, end_date, items, existing_map)

    inputs = _load_week_inputs(
        db, location_id, start_date,
        extra_employee_ids={a.employee_id for a in items},
        require_staff=False,
        honor_overrides=True,
    )

    placements = []
    for a in items:
        position_id = a.position_id
        if position_id is None:
            # Installed mobile builds don't send the role: an existing row keeps its own
            row = existing_map.get((a.employee_id, a.shift_id, a.date))
            position_id = row.position_id if row else None
        placements.append(Placement(
            employee_id=a.employee_id,
            shift_id=a.shift_id,
            day_idx=(a.date - start_date).days,
            position_id=position_id,
            start_time=a.start_time,
            end_time=a.end_time,
        ))

    result = check_schedule(
        placements,
        shifts=inputs.shifts,
        demand=inputs.demand,
        employee_positions=inputs.employee_positions,
        weekly_constraints=inputs.parsed_constraints,
        employee_settings=inputs.settings,
        employee_states=inputs.states,
        active_employee_ids=[e.id for e in inputs.employees if e.is_active and e.location_id == location_id],
        num_days=NUM_DAYS,
    )
    return schemas.ScheduleCheckResponse(
        violations=[_violation_adapter.validate_python(_issue_payload(v, start_date)) for v in result.violations],
    )
