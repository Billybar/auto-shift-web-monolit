# app/services/default_constraints_service.py
"""
Default constraints: an employee's recurring "default week" of board marks
(EmployeeDefaultConstraint: board row x day of week).

A week the employee hasn't decided uses the defaults; a decided week uses only its saved
WeeklyConstraint rows. An (employee, week starting Sunday) uses the defaults when all three hold:
1. no WeeklyNote of that week has submitted_at set (saving, importing and publishing set it),
2. the employee has no WeeklyConstraint row on any date of the week (rows written without a
   marker: legacy weeks, seeds, tests), and
3. the week hasn't ended. Weeks from before this feature keep their meaning.

Everything that reads availability goes through effective_constraints, so the board, the solver
and the schedule checker agree.
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional, Set, Tuple

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.enums import ConstraintType
from app.core.models import EmployeeDefaultConstraint, Employee, ShiftDefinition, WeeklyConstraint, WeeklyNote
from app.services.shift_demand_service import system_day_of_week

# mark_submitted(note=UNSET) leaves the note as it is
UNSET = object()

EmployeeWeek = Tuple[int, date]


@dataclass(frozen=True)
class EffectiveConstraint:
    """One board mark of an employee on a date, saved or taken from the defaults."""
    employee_id: int
    group_id: int
    date: date
    constraint_type: ConstraintType
    # None when the mark comes from the employee's defaults
    row_id: Optional[int] = None


def week_start_of(on_date: date) -> date:
    """The Sunday starting the week of the date."""
    return on_date - timedelta(days=system_day_of_week(on_date))


def board_group_ids(db: Session, location_id: int) -> Set[int]:
    """The groups (board rows) that hold a shift of the location."""
    return set(db.execute(
        select(ShiftDefinition.constraint_group_id).where(ShiftDefinition.location_id == location_id)
    ).scalars().all())


def mark_submitted(db: Session, employee_ids: Iterable[int], week_start: date, note=UNSET) -> None:
    """
    Marks the employees' week as submitted, so it stops using their defaults. Touches the note
    only when one is passed (None clears it). Doesn't commit.
    """
    employee_ids = sorted(set(employee_ids))
    if not employee_ids:
        return
    now = datetime.now()
    values = [{"employee_id": emp_id, "week_start_date": week_start, "submitted_at": now} for emp_id in employee_ids]
    if note is not UNSET:
        for value in values:
            value["note"] = note
    stmt = pg_insert(WeeklyNote).values(values)
    update = {"submitted_at": stmt.excluded.submitted_at}
    if note is not UNSET:
        update["note"] = stmt.excluded.note
    db.execute(stmt.on_conflict_do_update(index_elements=["employee_id", "week_start_date"], set_=update))


def effective_constraints(
    db: Session,
    employee_ids: Iterable[int],
    start_date: date,
    end_date: date,
    today: Optional[date] = None,
) -> Tuple[List[EffectiveConstraint], Set[EmployeeWeek]]:
    """
    The employees' marks in [start_date, end_date]: the saved rows of decided weeks, and the defaults
    spread over the dates of weeks that use them. Also returns the (employee, week start) pairs that
    used the defaults, including those whose defaults are empty.
    """
    employee_ids = sorted(set(employee_ids))
    if not employee_ids or end_date < start_date:
        return [], set()
    today = today or date.today()

    # Whole weeks: a row anywhere in the week decides it, even outside the requested range
    first_week, last_week = week_start_of(start_date), week_start_of(end_date)
    rows = db.execute(
        select(WeeklyConstraint).where(
            WeeklyConstraint.employee_id.in_(employee_ids),
            WeeklyConstraint.date >= first_week,
            WeeklyConstraint.date <= last_week + timedelta(days=6),
        )
    ).scalars().all()
    submitted: Set[EmployeeWeek] = set(db.execute(
        select(WeeklyNote.employee_id, WeeklyNote.week_start_date).where(
            WeeklyNote.employee_id.in_(employee_ids),
            WeeklyNote.week_start_date >= first_week,
            WeeklyNote.week_start_date <= last_week,
            WeeklyNote.submitted_at.is_not(None),
        )
    ).tuples().all())
    weeks_with_rows = {(row.employee_id, week_start_of(row.date)) for row in rows}

    weeks: List[date] = []
    week = first_week
    while week <= last_week:
        weeks.append(week)
        week += timedelta(days=7)
    using_defaults = {
        (emp_id, week)
        for emp_id in employee_ids
        for week in weeks
        if week + timedelta(days=6) >= today
        and (emp_id, week) not in submitted
        and (emp_id, week) not in weeks_with_rows
    }

    result = [
        EffectiveConstraint(row.employee_id, row.group_id, row.date, row.constraint_type, row.id)
        for row in rows
        if start_date <= row.date <= end_date
    ]

    if using_defaults:
        templates: Dict[int, List[EmployeeDefaultConstraint]] = {}
        for item in db.execute(
            select(EmployeeDefaultConstraint).where(
                EmployeeDefaultConstraint.employee_id.in_({emp_id for emp_id, _ in using_defaults})
            )
        ).scalars().all():
            templates.setdefault(item.employee_id, []).append(item)
        on_date = start_date
        while on_date <= end_date:
            week, day = week_start_of(on_date), system_day_of_week(on_date)
            for emp_id, items in templates.items():
                if (emp_id, week) not in using_defaults:
                    continue
                result.extend(
                    EffectiveConstraint(emp_id, item.group_id, on_date, item.constraint_type)
                    for item in items
                    if item.day_of_week == day
                )
            on_date += timedelta(days=1)

    result.sort(key=lambda c: (c.employee_id, c.date, c.group_id))
    return result, using_defaults


def get_template(db: Session, employee: Employee) -> List[EmployeeDefaultConstraint]:
    """The employee's defaults on their current board (rows of groups no longer on it are left out)."""
    groups = board_group_ids(db, employee.location_id)
    items = db.execute(
        select(EmployeeDefaultConstraint).where(EmployeeDefaultConstraint.employee_id == employee.id)
    ).scalars().all()
    return sorted(
        (item for item in items if item.group_id in groups),
        key=lambda item: (item.day_of_week, item.group_id),
    )


def replace_template(
    db: Session, employee: Employee, wanted: Dict[Tuple[int, int], ConstraintType]
) -> None:
    """
    Replaces the employee's defaults on their current board with wanted: (group_id, day_of_week) ->
    type, already validated. Rows of groups no longer on the board are left untouched, as sync does.
    Flushes; the caller commits.
    """
    groups = board_group_ids(db, employee.location_id)
    existing = {
        (item.group_id, item.day_of_week): item
        for item in db.execute(
            select(EmployeeDefaultConstraint).where(EmployeeDefaultConstraint.employee_id == employee.id)
        ).scalars().all()
        if item.group_id in groups
    }
    for key, item in existing.items():
        if key not in wanted:
            db.delete(item)
        elif item.constraint_type != wanted[key]:
            item.constraint_type = wanted[key]
    db.add_all(
        EmployeeDefaultConstraint(employee_id=employee.id, group_id=group_id, day_of_week=day, constraint_type=c_type)
        for (group_id, day), c_type in wanted.items()
        if (group_id, day) not in existing
    )
    db.flush()


def freeze_week(db: Session, location_id: int, week_start: date, today: Optional[date] = None) -> None:
    """
    Publishing a week freezes it: every employee of the location whose week still uses the defaults
    gets them saved as WeeklyConstraint rows, and the week is marked submitted for every employee of
    the location, so a later change to the defaults leaves the published week as it was.
    A week that has ended never uses defaults, so it gets nothing. Flushes; the caller commits.
    """
    employee_ids = list(db.execute(select(Employee.id).where(Employee.location_id == location_id)).scalars().all())
    if not employee_ids or week_start + timedelta(days=6) < (today or date.today()):
        return
    marks, _ = effective_constraints(
        db, employee_ids, week_start, week_start + timedelta(days=6), today=today
    )
    db.add_all(
        WeeklyConstraint(
            employee_id=mark.employee_id, group_id=mark.group_id, date=mark.date, constraint_type=mark.constraint_type,
        )
        for mark in marks
        if mark.row_id is None
    )
    mark_submitted(db, employee_ids, week_start)
    db.flush()
