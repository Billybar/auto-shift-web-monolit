# app/services/position_service.py
from typing import List, Optional, Sequence

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.constants import DEFAULT_POSITION_COLOR, DEFAULT_POSITION_NAME
from app.core.enums import ErrorCode
from app.core.errors import AppError
from app.core.models import Employee, EmployeePosition, Position


def new_default_position() -> Position:
    """The role a new location starts with (also what existing data was migrated to)."""
    return Position(name=DEFAULT_POSITION_NAME, color=DEFAULT_POSITION_COLOR, sort_order=0, is_active=True)


def get_active_positions(db: Session, location_id: int) -> List[Position]:
    stmt = (
        select(Position)
        .where(Position.location_id == location_id, Position.is_active.is_(True))
        .order_by(Position.sort_order, Position.id)
    )
    return list(db.execute(stmt).scalars().all())


def set_employee_positions(
    db: Session, employee: Employee, position_ids: Sequence[int], primary_position_id: Optional[int]
) -> None:
    """
    Replaces the employee's active roles with `position_ids` (archived roles stay linked, so
    restoring one brings it back). The primary must be one of the ids, or None for the first.

    Raises AppError POSITION_INVALID for an id that isn't an active role of the employee's
    location. Rows are replaced with a Core delete, a flush, then the inserts, so the old primary
    is gone before the new one is written (one primary per employee is a unique index).
    Flushes; the caller commits.
    """
    active_ids = {p.id for p in get_active_positions(db, employee.location_id)}
    requested = list(dict.fromkeys(position_ids))  # dedupe, keep order
    invalid = [pid for pid in requested if pid not in active_ids]
    if invalid or (primary_position_id is not None and primary_position_id not in requested):
        raise AppError(
            ErrorCode.POSITION_INVALID,
            "Positions must be active roles of the employee's location, and the primary one of them",
            status_code=400,
            params={"position_ids": invalid or [primary_position_id]},
        )
    if primary_position_id is None and requested:
        primary_position_id = requested[0]

    if active_ids:
        db.execute(delete(EmployeePosition).where(
            EmployeePosition.employee_id == employee.id,
            EmployeePosition.position_id.in_(active_ids),
        ))
    if primary_position_id is not None:
        # An archived role may still be marked primary; the new primary replaces it
        db.execute(
            update(EmployeePosition)
            .where(EmployeePosition.employee_id == employee.id)
            .values(is_primary=False)
        )
    db.flush()
    db.add_all(
        EmployeePosition(employee_id=employee.id, position_id=pid, is_primary=(pid == primary_position_id))
        for pid in requested
    )
    db.flush()
    db.expire(employee, ["position_links"])


def clear_employee_positions(db: Session, employee: Employee) -> None:
    """Removes every role link (used when the employee moves to another location). Flushes."""
    db.execute(delete(EmployeePosition).where(EmployeePosition.employee_id == employee.id))
    db.flush()
    db.expire(employee, ["position_links"])


def assign_single_position_if_unambiguous(db: Session, employee: Employee) -> None:
    """
    When the location has exactly one active role, an employee without roles gets it as primary,
    so single-role locations work exactly as before roles existed. Flushes.
    """
    active = get_active_positions(db, employee.location_id)
    if len(active) == 1:
        set_employee_positions(db, employee, [active[0].id], active[0].id)


def resolve_primary(
    current_primary_id: Optional[int], position_ids: Sequence[int], primary_position_id: Optional[int]
) -> Optional[int]:
    """Primary for an update: as sent, else the current one if still in the set, else the first id."""
    if primary_position_id is not None:
        return primary_position_id
    if current_primary_id in position_ids:
        return current_primary_id
    return position_ids[0] if position_ids else None
