# app/services/assignment_sync_service.py
"""
Smart Sync for a location's assignments (see the module docstring of app/api/endpoints_assignments.py).

Roles: each row carries the role (position) the employee fills. Installed mobile builds never send
one, and they can't be updated, so a row without a role is always accepted:
- an existing row keeps its current role;
- a new row gets a role inferred from the employee's roles and the slots still open in that shift.
"""
import logging
from datetime import date
from typing import Dict, List, Optional, Sequence, Tuple

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import models, schemas
from app.core.enums import ErrorCode
from app.core.errors import AppError
from app.services import shift_demand_service

logger = logging.getLogger(__name__)

AssignmentKey = Tuple[int, int, date]  # (employee_id, shift_id, date)


class SyncValidationError(ValueError):
    """The payload contradicts itself or the location (the endpoint returns 422)."""


def _validate(
    db: Session,
    location_id: int,
    start_date: date,
    end_date: date,
    items: Sequence[schemas.AssignmentCreate],
    existing_map: Dict[AssignmentKey, models.Assignment],
) -> None:
    if end_date < start_date:
        raise SyncValidationError("end_date is before start_date")

    keys = [(a.employee_id, a.shift_id, a.date) for a in items]
    if len(keys) != len(set(keys)):
        raise SyncValidationError("The same employee appears twice in the same shift and date")
    if any(not (start_date <= a.date <= end_date) for a in items):
        raise SyncValidationError("Every assignment date must be inside start_date..end_date")

    # Employees who left the location may still appear on rows that already exist (history weeks)
    employee_ids = set(db.execute(
        select(models.Employee.id).where(models.Employee.location_id == location_id)
    ).scalars().all())
    employee_ids |= {a.employee_id for a in existing_map.values()}
    shift_ids = set(db.execute(
        select(models.ShiftDefinition.id).where(models.ShiftDefinition.location_id == location_id)
    ).scalars().all())
    # Archived roles are accepted: history weeks are sent back with the roles they were saved with
    position_ids = set(db.execute(
        select(models.Position.id).where(models.Position.location_id == location_id)
    ).scalars().all())

    for a in items:
        if a.employee_id not in employee_ids:
            raise SyncValidationError(f"Employee {a.employee_id} does not belong to this location")
        if a.shift_id not in shift_ids:
            raise SyncValidationError(f"Shift {a.shift_id} does not belong to this location")
        if a.position_id is not None and a.position_id not in position_ids:
            raise SyncValidationError(f"Position {a.position_id} does not belong to this location")


def _infer_position(
    employee_id: int,
    shift_id: int,
    on_date: date,
    links: Dict[int, List[models.EmployeePosition]],
    demand: shift_demand_service.DemandMap,
    filled: Dict[Tuple[int, date, int], int],
) -> int:
    """
    Role for a new row sent without one:
    1. the employee's active role with the largest open gap in that shift and date;
    2. otherwise their primary role;
    3. otherwise their first role by sort_order (active roles first).
    """
    employee_links = links.get(employee_id, [])
    if not employee_links:
        raise AppError(
            ErrorCode.EMPLOYEE_HAS_NO_POSITIONS,
            f"Employee {employee_id} has no roles, so the shift's role can't be chosen",
            status_code=400,
            params={"employee_id": employee_id},
        )
    active = [link for link in employee_links if link.position.is_active]
    primary = next((link for link in employee_links if link.is_primary), None)

    def gap(link: models.EmployeePosition) -> int:
        cell = demand.get((shift_id, on_date, link.position_id))
        return (cell.required if cell else 0) - filled.get((shift_id, on_date, link.position_id), 0)

    open_roles = [link for link in active if gap(link) > 0]
    if open_roles:
        # Ties go to the primary role, then to sort order
        best = max(open_roles, key=lambda link: (gap(link), link.is_primary, -link.position.sort_order, -link.position_id))
        return best.position_id
    if primary is not None and primary.position.is_active:
        return primary.position_id
    first = min(employee_links, key=lambda link: (not link.position.is_active, link.position.sort_order, link.position_id))
    return first.position_id


def sync_assignments(
    db: Session,
    location_id: int,
    start_date: date,
    end_date: date,
    items: Sequence[schemas.AssignmentCreate],
) -> schemas.AssignmentSyncResponse:
    """
    Makes the location's assignments in [start_date, end_date] equal `items`, in one transaction.
    Rows are matched on (employee, shift, date); a match keeps its id and gets the role and hours
    updated in place. Commits.
    """
    existing = db.execute(
        select(models.Assignment).where(
            models.Assignment.location_id == location_id,
            models.Assignment.date >= start_date,
            models.Assignment.date <= end_date,
        )
    ).scalars().all()
    existing_map: Dict[AssignmentKey, models.Assignment] = {(a.employee_id, a.shift_id, a.date): a for a in existing}

    _validate(db, location_id, start_date, end_date, items, existing_map)

    # Roles of every row in the final state that is already known: sent, or kept from the DB
    final_position: Dict[AssignmentKey, int] = {}
    to_infer: List[schemas.AssignmentCreate] = []
    for a in items:
        key = (a.employee_id, a.shift_id, a.date)
        if a.position_id is not None:
            final_position[key] = a.position_id
        elif key in existing_map:
            final_position[key] = existing_map[key].position_id
        else:
            to_infer.append(a)

    if to_infer:
        filled: Dict[Tuple[int, date, int], int] = {}
        for (_, shift_id, on_date), position_id in final_position.items():
            filled[(shift_id, on_date, position_id)] = filled.get((shift_id, on_date, position_id), 0) + 1
        demand = shift_demand_service.resolve_demand(db, location_id, start_date, end_date)
        link_rows = db.execute(
            select(models.EmployeePosition)
            .join(models.Position, models.Position.id == models.EmployeePosition.position_id)
            .where(
                models.EmployeePosition.employee_id.in_({a.employee_id for a in to_infer}),
                models.Position.location_id == location_id,
            )
        ).scalars().all()
        links: Dict[int, List[models.EmployeePosition]] = {}
        for link in link_rows:
            links.setdefault(link.employee_id, []).append(link)

        for a in to_infer:
            position_id = _infer_position(a.employee_id, a.shift_id, a.date, links, demand, filled)
            final_position[(a.employee_id, a.shift_id, a.date)] = position_id
            filled[(a.shift_id, a.date, position_id)] = filled.get((a.shift_id, a.date, position_id), 0) + 1

    added = updated = 0
    incoming_keys = set()
    for a in items:
        key = (a.employee_id, a.shift_id, a.date)
        incoming_keys.add(key)
        position_id = final_position[key]
        db_obj = existing_map.get(key)
        if db_obj is None:
            db.add(models.Assignment(
                location_id=location_id,
                employee_id=a.employee_id,
                shift_id=a.shift_id,
                date=a.date,
                position_id=position_id,
                start_time=a.start_time,
                end_time=a.end_time,
            ))
            added += 1
        elif (db_obj.position_id, db_obj.start_time, db_obj.end_time) != (position_id, a.start_time, a.end_time):
            db_obj.position_id = position_id
            db_obj.start_time = a.start_time
            db_obj.end_time = a.end_time
            updated += 1

    removed = 0
    for key, db_obj in existing_map.items():
        if key not in incoming_keys:
            db.delete(db_obj)
            removed += 1

    try:
        db.commit()
    except IntegrityError:
        # Another save of the same week inserted one of these rows first
        db.rollback()
        logger.exception(f"Concurrent edit while syncing assignments for location {location_id}")
        raise AppError(
            ErrorCode.SCHEDULE_CONCURRENT_EDIT,
            "The schedule was changed by someone else while saving",
            status_code=409,
        )

    return schemas.AssignmentSyncResponse(
        added=added,
        updated=updated,
        removed=removed,
        unchanged=len(existing) - removed - updated,
    )
