import logging
from datetime import date, timedelta
from typing import Dict, Set, List

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core import config, models, schemas
from app.core.constants import DEFAULT_LOCATION_WEIGHTS
from app.core.enums import ErrorCode
from app.core.errors import AppError
from app.engine.employee_history import EmployeeHistoricalState
from app.engine.solver import ShiftOptimizer
from app.services import shift_demand_service

logger = logging.getLogger(__name__)


def calculate_historical_states(db: Session, location_id: int, start_date: date) -> Dict[int, EmployeeHistoricalState]:
    """
    Calculates the historical state (streak, weekend shifts) for all employees
    in a given location for the 7 days preceding the start_date.
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

    emp_assignments: Dict[int, List[models.Assignment]] = {}
    for assignment in assignments:
        emp_assignments.setdefault(assignment.employee_id, []).append(assignment)

    states: Dict[int, EmployeeHistoricalState] = {}

    for emp_id, shifts in emp_assignments.items():
        worked_last_fri_night = False
        worked_last_sat_noon = False
        worked_last_sat_night = False
        worked_dates: Set[date] = set()

        for shift in shifts:
            worked_dates.add(shift.date)
            shift_name = shift.shift_def.name.strip()

            if shift.date.weekday() == 4: # Friday
                if "לילה" in shift_name:
                    worked_last_fri_night = True
            elif shift.date.weekday() == 5: # Saturday
                if "ערב" in shift_name or "צהריים" in shift_name:
                    worked_last_sat_noon = True
                elif "לילה" in shift_name:
                    worked_last_sat_night = True

        streak = 0
        current_check_date = history_end
        while current_check_date >= history_start:
            if current_check_date in worked_dates:
                streak += 1
                current_check_date -= timedelta(days=1)
            else:
                break

        states[emp_id] = EmployeeHistoricalState(
            employee_id=emp_id,
            history_streak=streak,
            worked_last_fri_night=worked_last_fri_night,
            worked_last_sat_noon=worked_last_sat_noon,
            worked_last_sat_night=worked_last_sat_night
        )

    return states

def generate_weekly_schedule(db: Session, location_id: int, start_date: date) -> schemas.AutoScheduleResponse:
    """
    Orchestrates the schedule process:
    1. Fetch data from DB
    2. Run Solver
    3. Return the draft (nothing is saved; the client saves it through Smart Sync)
    """
    num_days = 7
    end_date = start_date + timedelta(days=num_days - 1)

    # --- 1. Fetch Data ---
    location = db.execute(select(models.Location).where(models.Location.id == location_id)).scalar_one_or_none()
    if not location:
        raise AppError(ErrorCode.LOCATION_NOT_FOUND, f"Location with ID {location_id} not found", status_code=404)

    # Active employees with their settings and roles
    stmt_emp = (
        select(models.Employee)
        .options(selectinload(models.Employee.settings), selectinload(models.Employee.position_links))
        .where(models.Employee.location_id == location_id, models.Employee.is_active == True)
    )
    employees = db.execute(stmt_emp).scalars().all()
    if not employees:
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
    if not any(employee_positions.values()):
        raise AppError(
            ErrorCode.SCHEDULE_NO_STAFFABLE_EMPLOYEES,
            "No active employee holds an active role in this location",
            status_code=409,
        )

    # Shifts in chronological order (the engine reads the first as morning, the last as night)
    shifts = db.execute(
        select(models.ShiftDefinition)
        .where(models.ShiftDefinition.location_id == location_id)
        .order_by(models.ShiftDefinition.start_time)
    ).scalars().all()

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
    parsed_constraints = [
        {
            "employee_id": c.employee_id,
            "day_idx": (c.date - start_date).days,
            "shift_id": c.shift_id,
            # The exact enum value (e.g., 'must_work', 'cannot_work')
            "type": c.constraint_type,
        }
        for c in db_constraints
    ]

    # --- Employee States (carryover from the previous week) ---
    calculated_states = calculate_historical_states(db, location_id, start_date)
    employee_states_dict = {
        emp.id: calculated_states.get(emp.id) or EmployeeHistoricalState(employee_id=emp.id) for emp in employees
    }

    # --- 2. Run Engine ---
    logger.info(f"Starting optimization for location {location_id} with {len(employees)} employees")
    optimizer = ShiftOptimizer(
        employees=employees,
        shifts=shifts,
        weights=weights,
        demand=demand,
        employee_positions=employee_positions,
        primary_position=primary_position,
        weekly_constraints=parsed_constraints,
        num_days=num_days,
        max_time_seconds=config.SOLVER_MAX_SECONDS,
        num_workers=config.SOLVER_NUM_WORKERS,
    )
    result = optimizer.solve(emp_settings_dict, employee_states_dict)
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
