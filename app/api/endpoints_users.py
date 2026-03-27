from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List

from app.core import models, schemas
from app.core.database import get_db

# Security dependencies
from app.api.dependencies import get_current_user, get_current_admin_user, get_current_manager_user
# Assuming you have a password hasher in your security module
from app.core.security import get_password_hash

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
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_manager_user)
):
    """
    Retrieve users.
    Admins see everyone. Managers see only users within their organization.
    """
    stmt = select(models.User)

    # Data Filtering: If the user is a Manager (not Admin), restrict to their organization
    if current_user.role != schemas.RoleEnum.ADMIN:
        stmt = stmt.where(models.User.organization_id == current_user.organization_id)

    stmt = stmt.offset(skip).limit(limit)
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
    # 1. Verify username is unique
    existing_user_stmt = select(models.User).where(models.User.username == user_in.username)
    if db.execute(existing_user_stmt).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # 2. Create the base User object (hash the password!)
    new_user = models.User(
        username=user_in.username,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        organization_id=user_in.organization_id,
        employee_id=user_in.employee_id
    )

    # 3. Handle Many-to-Many associations if IDs were provided
    # SQLAlchemy will automatically insert these into the association tables
    if user_in.client_ids:
        clients_stmt = select(models.Client).where(models.Client.id.in_(user_in.client_ids))
        new_user.clients = list(db.execute(clients_stmt).scalars().all())

    if user_in.location_ids:
        locations_stmt = select(models.Location).where(models.Location.id.in_(user_in.location_ids))
        new_user.locations = list(db.execute(locations_stmt).scalars().all())

    # 4. Save to database
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user