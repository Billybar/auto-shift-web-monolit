"""
Positions (תפקידים): the roles an employee fills in a shift, defined per location.
Archive a role (is_active=False) to hide it from new demand and auto-assign while keeping its
history; a role that assignments use can't be deleted.
"""
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.access import ensure_location_access
from app.api.dependencies import get_current_scheduler_user, get_current_user
from app.core import models, schemas
from app.core.database import get_db
from app.core.enums import ErrorCode
from app.core.errors import AppError

logger = logging.getLogger(__name__)

router = APIRouter()


def _name_taken_error(name: str) -> AppError:
    return AppError(
        ErrorCode.POSITION_NAME_TAKEN,
        "A role with this name already exists in this location",
        status_code=status.HTTP_409_CONFLICT,
        params={"name": name},
    )


def _name_taken(db: Session, location_id: int, name: str, exclude_id: int = None) -> bool:
    stmt = select(models.Position.id).where(models.Position.location_id == location_id, models.Position.name == name)
    if exclude_id is not None:
        stmt = stmt.where(models.Position.id != exclude_id)
    return db.execute(stmt).first() is not None


def _get_position_in_scope(db: Session, user: models.User, position_id: int) -> models.Position:
    """Returns the position, or 404 when it doesn't exist or its location is out of the user's scope."""
    position = db.execute(select(models.Position).where(models.Position.id == position_id)).scalar_one_or_none()
    if not position:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Position not found or access denied")
    try:
        ensure_location_access(db, user, position.location_id)
    except HTTPException:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Position not found or access denied")
    return position


@router.get("/", response_model=List[schemas.PositionResponse])
def read_positions(
    location_id: int,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List a location's roles in display order. Employees can read their own location's roles."""
    ensure_location_access(db, current_user, location_id, allow_own_employee_location=True)

    stmt = select(models.Position).where(models.Position.location_id == location_id)
    if not include_archived:
        stmt = stmt.where(models.Position.is_active.is_(True))
    stmt = stmt.order_by(models.Position.sort_order, models.Position.id)
    return db.execute(stmt).scalars().all()


@router.post("/", response_model=schemas.PositionResponse, status_code=status.HTTP_201_CREATED)
def create_position(
    position_in: schemas.PositionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_scheduler_user),
):
    """Add a role to a location. Without sort_order it goes after the last role."""
    ensure_location_access(db, current_user, position_in.location_id)

    if _name_taken(db, position_in.location_id, position_in.name):
        raise _name_taken_error(position_in.name)

    sort_order = position_in.sort_order
    if sort_order is None:
        last = db.execute(
            select(func.max(models.Position.sort_order)).where(models.Position.location_id == position_in.location_id)
        ).scalar_one_or_none()
        sort_order = 0 if last is None else last + 1

    position = models.Position(
        location_id=position_in.location_id,
        name=position_in.name,
        color=position_in.color,
        sort_order=sort_order,
        is_active=True,
    )
    db.add(position)
    try:
        db.commit()
    except IntegrityError:
        # Another request added the same name between the check and the commit
        db.rollback()
        raise _name_taken_error(position_in.name)
    db.refresh(position)
    return position


@router.put("/{position_id}", response_model=schemas.PositionResponse)
def update_position(
    position_id: int,
    position_in: schemas.PositionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_scheduler_user),
):
    """Rename, recolor, reorder, or archive / restore (is_active) a role. Only the fields sent change."""
    position = _get_position_in_scope(db, current_user, position_id)

    update_data = position_in.model_dump(exclude_unset=True)
    # Explicit nulls mean "no change": every column is required
    update_data = {key: value for key, value in update_data.items() if value is not None}
    if "name" in update_data and _name_taken(db, position.location_id, update_data["name"], exclude_id=position.id):
        raise _name_taken_error(update_data["name"])

    for key, value in update_data.items():
        setattr(position, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _name_taken_error(update_data.get("name", position.name))
    db.refresh(position)
    return position


@router.delete("/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_position(
    position_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_scheduler_user),
):
    """
    Delete a role, with its employee links and demand. Refused with 409 POSITION_IN_USE when any
    assignment uses it (archive it instead, so the history keeps its role).
    """
    position = _get_position_in_scope(db, current_user, position_id)

    in_use = db.execute(
        select(models.Assignment.id).where(models.Assignment.position_id == position.id).limit(1)
    ).first()
    if in_use:
        raise AppError(
            ErrorCode.POSITION_IN_USE,
            "This role is used by assignments; archive it instead",
            status_code=status.HTTP_409_CONFLICT,
        )

    db.delete(position)
    try:
        db.commit()
    except IntegrityError:
        # An assignment with this role was saved between the check and the delete
        db.rollback()
        raise AppError(
            ErrorCode.POSITION_IN_USE,
            "This role is used by assignments; archive it instead",
            status_code=status.HTTP_409_CONFLICT,
        )
    return None
