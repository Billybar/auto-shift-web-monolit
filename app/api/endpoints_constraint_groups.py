"""
Constraint groups: the rows of the constraints board. Each shift is marked through its group, and
a manager merges shifts into one row (e.g. two mornings with the same hours) or splits them apart.
Merge and split keep every submitted constraint; see app/services/constraint_group_service.py.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.access import ensure_location_access
from app.api.dependencies import get_current_scheduler_user, get_current_user
from app.core import models, schemas
from app.core.database import get_db
from app.services import constraint_group_service

router = APIRouter()


def _to_response(group: models.ConstraintGroup) -> schemas.ConstraintGroupResponse:
    return schemas.ConstraintGroupResponse(
        id=group.id,
        location_id=group.location_id,
        name=group.name,
        shift_ids=constraint_group_service.sorted_shift_ids(group),
    )


def _get_group_in_scope(db: Session, user: models.User, group_id: int) -> models.ConstraintGroup:
    """Returns the group, or 404 when it doesn't exist or its location is out of the user's scope."""
    group = db.execute(
        select(models.ConstraintGroup)
        .options(selectinload(models.ConstraintGroup.shifts))
        .where(models.ConstraintGroup.id == group_id)
    ).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Constraint group not found or access denied")
    try:
        ensure_location_access(db, user, group.location_id)
    except HTTPException:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Constraint group not found or access denied")
    return group


@router.get("/", response_model=List[schemas.ConstraintGroupResponse])
def read_constraint_groups(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    The constraints-board rows of a location, in the order of the work day of their first shift.
    Only rows that have shifts are listed. Employees can read their own location's rows.
    """
    ensure_location_access(db, current_user, location_id, allow_own_employee_location=True)
    return [_to_response(group) for group in constraint_group_service.list_groups(db, location_id)]


@router.put("/{group_id}", response_model=schemas.ConstraintGroupResponse)
def update_constraint_group(
    group_id: int,
    group_in: schemas.ConstraintGroupUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_scheduler_user),
):
    """Rename a board row. An empty name clears it, and the board shows the shift names instead."""
    group = _get_group_in_scope(db, current_user, group_id)
    group.name = group_in.name or None
    db.commit()
    db.refresh(group)
    return _to_response(group)


@router.post("/{group_id}/merge", response_model=schemas.ConstraintGroupMergeResponse)
def merge_constraint_groups(
    group_id: int,
    payload: schemas.ConstraintGroupMerge,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_scheduler_user),
):
    """
    Merge another row of the same location into this one: its shifts and submitted constraints
    move here. Where this row already has a constraint for the same employee and date, this row's
    wins and the other is kept as history (counted in `conflicts`).
    """
    target = _get_group_in_scope(db, current_user, group_id)
    source = _get_group_in_scope(db, current_user, payload.source_group_id)
    if source.id == target.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot merge a row into itself.")
    if source.location_id != target.location_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Both rows must be in the same location.")
    if not source.shifts:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The merged row has no shifts.")

    result = constraint_group_service.merge(db, target, source)
    db.commit()
    db.refresh(target)
    return schemas.ConstraintGroupMergeResponse(
        group=_to_response(target), moved=result.moved, conflicts=result.conflicts,
    )


@router.post("/{group_id}/split", response_model=schemas.ConstraintGroupResponse)
def split_constraint_group(
    group_id: int,
    payload: schemas.ConstraintGroupSplit,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_scheduler_user),
):
    """
    Move one shift of a row into a new row of its own. The row's submitted constraints are copied
    to the new row, so the shift keeps them. Returns the new row.
    """
    group = _get_group_in_scope(db, current_user, group_id)
    shift = next((s for s in group.shifts if s.id == payload.shift_id), None)
    if shift is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The shift is not part of this row.")
    if len(group.shifts) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A row with one shift can't be split.")

    new_group = constraint_group_service.split(db, group, shift)
    db.commit()
    db.refresh(new_group)
    return _to_response(new_group)
