# app/services/shift_demand_service.py
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Dict, Iterable, List, Tuple

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.models import Position, ShiftDefinition, ShiftDemand, ShiftDemandOverride


@dataclass(frozen=True)
class DemandCell:
    required: int
    is_override: bool


# (shift_id, date, position_id) -> DemandCell
DemandMap = Dict[Tuple[int, date, int], DemandCell]


def system_day_of_week(on_date: date) -> int:
    """Our week: 0 = Sunday … 6 = Saturday (Python's weekday() starts on Monday)."""
    return (on_date.weekday() + 1) % 7


def _active_position_ids(db: Session, location_id: int) -> List[int]:
    stmt = (
        select(Position.id)
        .where(Position.location_id == location_id, Position.is_active.is_(True))
        .order_by(Position.sort_order, Position.id)
    )
    return list(db.execute(stmt).scalars().all())


def resolve_demand(db: Session, location_id: int, start: date, end: date) -> DemandMap:
    """
    The effective demand of every shift × active role × date in [start, end].
    Dense: a cell with no template row and no override is returned with 0, because the web
    client edits cells in place and ignores ones it doesn't have.

    Precedence: the date's override, then the weekday's template row, then 0.
    Archived roles are left out.
    """
    shift_ids = list(db.execute(
        select(ShiftDefinition.id)
        .where(ShiftDefinition.location_id == location_id)
        .order_by(ShiftDefinition.start_time, ShiftDefinition.id)
    ).scalars().all())
    position_ids = _active_position_ids(db, location_id)
    if not shift_ids or not position_ids:
        return {}

    templates = db.execute(
        select(ShiftDemand).where(
            ShiftDemand.shift_definition_id.in_(shift_ids),
            ShiftDemand.position_id.in_(position_ids),
        )
    ).scalars().all()
    template_map = {(t.shift_definition_id, t.day_of_week, t.position_id): t.required_employees for t in templates}

    overrides = db.execute(
        select(ShiftDemandOverride).where(
            ShiftDemandOverride.shift_definition_id.in_(shift_ids),
            ShiftDemandOverride.position_id.in_(position_ids),
            ShiftDemandOverride.date >= start,
            ShiftDemandOverride.date <= end,
        )
    ).scalars().all()
    override_map = {(o.shift_definition_id, o.date, o.position_id): o.required_employees for o in overrides}

    result: DemandMap = {}
    for shift_id in shift_ids:
        for position_id in position_ids:
            for offset in range((end - start).days + 1):
                on_date = start + timedelta(days=offset)
                key = (shift_id, on_date, position_id)
                if key in override_map:
                    result[key] = DemandCell(override_map[key], True)
                else:
                    template_value = template_map.get((shift_id, system_day_of_week(on_date), position_id), 0)
                    result[key] = DemandCell(template_value, False)
    return result


def get_template(db: Session, location_id: int) -> List[ShiftDemand]:
    """The location's weekly template rows above 0, for active roles."""
    stmt = (
        select(ShiftDemand)
        .join(ShiftDefinition, ShiftDefinition.id == ShiftDemand.shift_definition_id)
        .join(Position, Position.id == ShiftDemand.position_id)
        .where(
            ShiftDefinition.location_id == location_id,
            Position.is_active.is_(True),
            ShiftDemand.required_employees > 0,
        )
        .order_by(ShiftDemand.shift_definition_id, Position.sort_order, ShiftDemand.position_id, ShiftDemand.day_of_week)
    )
    return list(db.execute(stmt).scalars().all())


def replace_template(
    db: Session, location_id: int, cells: Iterable[Tuple[int, int, int, int]]
) -> None:
    """
    Makes the active roles' template equal `cells`: (shift_id, day_of_week, position_id, required).
    Rows of archived roles are kept, so restoring a role brings its template back. Only rows
    above 0 are stored. The caller validates the ids and commits.
    """
    desired = {(s, d, p): required for s, d, p, required in cells if required > 0}
    position_ids = _active_position_ids(db, location_id)
    shift_ids = select(ShiftDefinition.id).where(ShiftDefinition.location_id == location_id)
    existing = db.execute(
        select(ShiftDemand).where(
            ShiftDemand.shift_definition_id.in_(shift_ids),
            ShiftDemand.position_id.in_(position_ids),
        )
    ).scalars().all()

    stale_ids = []
    for row in existing:
        key = (row.shift_definition_id, row.day_of_week, row.position_id)
        if key in desired:
            row.required_employees = desired.pop(key)
        else:
            stale_ids.append(row.id)
    if stale_ids:
        db.execute(delete(ShiftDemand).where(ShiftDemand.id.in_(stale_ids)))
    db.add_all(
        ShiftDemand(shift_definition_id=s, day_of_week=d, position_id=p, required_employees=required)
        for (s, d, p), required in desired.items()
    )
    db.flush()


def set_demand_override(
    db: Session, shift: ShiftDefinition, position_id: int, on_date: date, required_employees: int
) -> DemandCell:
    """
    Sets one role's demand on a date. A value equal to the template removes the override (reset).
    Flushes; the caller commits.
    """
    template = db.execute(
        select(ShiftDemand).where(
            ShiftDemand.shift_definition_id == shift.id,
            ShiftDemand.day_of_week == system_day_of_week(on_date),
            ShiftDemand.position_id == position_id,
        )
    ).scalar_one_or_none()
    template_value = template.required_employees if template else 0

    existing_override = db.execute(
        select(ShiftDemandOverride).where(
            ShiftDemandOverride.shift_definition_id == shift.id,
            ShiftDemandOverride.date == on_date,
            ShiftDemandOverride.position_id == position_id,
        )
    ).scalar_one_or_none()

    if required_employees == template_value:
        if existing_override:
            db.delete(existing_override)
            db.flush()
        return DemandCell(template_value, False)

    if existing_override:
        existing_override.required_employees = required_employees
    else:
        db.add(ShiftDemandOverride(
            shift_definition_id=shift.id,
            date=on_date,
            position_id=position_id,
            required_employees=required_employees,
        ))
    db.flush()
    return DemandCell(required_employees, True)
