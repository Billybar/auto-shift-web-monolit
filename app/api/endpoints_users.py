from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select
from typing import List

from app.core import models, schemas
from app.core.database import get_db
from app.core.enums import ErrorCode
from app.core.errors import AppError
from app.services import user_service

# Security dependencies
from app.api.dependencies import get_current_user, get_current_admin_user, get_current_manager_user

router = APIRouter()


@router.get("/me", response_model=schemas.UserResponse)
def read_current_user(current_user: models.User = Depends(get_current_user)):
    """
    Returns the currently logged-in user.
    Thanks to Pydantic and SQLAlchemy, this will automatically fetch
    and serialize the user's allowed locations and clients.
    """
    return current_user


@router.get("/", response_model=List[schemas.UserResponse])
def read_users(
        skip: int = 0,
        limit: int = 100,
        staff_only: bool = False,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_manager_user)
):
    """
    Retrieve users, oldest first.
    Admins see everyone. Managers see only users within their organization.
    With `staff_only`, employee logins are left out.
    """
    stmt = select(models.User).options(
        selectinload(models.User.clients),
        selectinload(models.User.locations).selectinload(models.Location.weights),
    )

    # Data Filtering: If the user is a Manager (not Admin), restrict to their organization
    if current_user.role != schemas.RoleEnum.ADMIN:
        stmt = stmt.where(models.User.organization_id == current_user.organization_id)

    if staff_only:
        stmt = stmt.where(models.User.role != schemas.RoleEnum.EMPLOYEE)

    stmt = stmt.order_by(models.User.id).offset(skip).limit(limit)
    users = db.execute(stmt).scalars().all()

    return users


@router.post("/", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
        user_in: schemas.UserCreate,
        db: Session = Depends(get_db),
        current_admin: models.User = Depends(get_current_admin_user)
):
    """
    Create a new user (Admin, Manager, or Scheduler) and assign access permissions.
    Only accessible by Admins.
    """
    try:
        new_user = user_service.create_staff_user(db, user_in)
        db.commit()
    except IntegrityError:
        # Two requests raced past the email check; the unique index refused the second one
        db.rollback()
        raise AppError(ErrorCode.EMAIL_TAKEN, "Email already registered", status_code=409)

    db.refresh(new_user)
    return new_user


def _get_staff_user_or_404(db: Session, user_id: int) -> models.User:
    """Load a staff login. Employee logins are managed through /api/employees/, so they count as missing."""
    user = db.get(models.User, user_id)
    if user is None or user.role == schemas.RoleEnum.EMPLOYEE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.put("/{user_id}", response_model=schemas.UserResponse)
def update_user(
        user_id: int,
        user_in: schemas.UserUpdate,
        db: Session = Depends(get_db),
        current_admin: models.User = Depends(get_current_admin_user)
):
    """
    Replace a staff user's details and access scope. Only accessible by Admins.
    """
    user = _get_staff_user_or_404(db, user_id)
    try:
        user_service.update_staff_user(db, user, user_in, current_admin)
        db.commit()
    except IntegrityError:
        # Two requests raced past the email check; the unique index refused the second one
        db.rollback()
        raise AppError(ErrorCode.EMAIL_TAKEN, "Email already registered", status_code=409)

    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
        user_id: int,
        db: Session = Depends(get_db),
        current_admin: models.User = Depends(get_current_admin_user)
) -> None:
    """
    Delete a staff user. Only accessible by Admins.
    """
    user = _get_staff_user_or_404(db, user_id)
    user_service.delete_staff_user(db, user, current_admin)
    db.commit()
