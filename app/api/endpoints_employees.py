import logging
from contextlib import contextmanager
from typing import Iterator, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core import models, schemas
from app.core.database import get_db
from app.core.errors import AppError
from app.services import employee_service, user_service
from app.api.access import AccessScope, ensure_location_access

# Import our security dependencies
from app.api.dependencies import get_current_user, get_current_scheduler_user

logger = logging.getLogger(__name__)

router = APIRouter()


@contextmanager
def _commit_or_409_on_taken_email(
    db: Session, email: Optional[str], conflict_detail: str, exclude_user_id: Optional[int] = None
) -> Iterator[None]:
    """
    Commit the writes made in the block once, and roll back if anything fails. The email was
    checked before the block, but another request may save it in between: that unique-key
    violation answers 409 `conflict_detail` instead of a server error.
    """
    try:
        yield
        db.commit()
    except IntegrityError:
        db.rollback()
        if email is not None and user_service.email_taken(db, email, exclude_user_id=exclude_user_id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=conflict_detail) from None
        raise
    except Exception:
        db.rollback()
        raise


# ==========================================
# Read Operations (Allowed for all authenticated users)
# ==========================================

@router.get("/", response_model=List[schemas.EmployeeResponse])
def read_employees(
    location_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    # Guard: Must be a logged-in user (Admin, Manager, Scheduler, or Employee)
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve employees.
    Admins see all. Managers/Schedulers see employees in their permitted locations.
    Regular employees see only colleagues in their own location.
    """
    scope = AccessScope.of(current_user, include_own_location=True)
    stmt = select(models.Employee).options(
        joinedload(models.Employee.user), selectinload(models.Employee.position_links)
    ).where(scope.location_filter(models.Employee.location_id))


    if location_id:
        stmt = stmt.where(models.Employee.location_id == location_id)

    stmt = stmt.offset(skip).limit(limit)
    result = db.execute(stmt)
    return result.scalars().all()


@router.get("/{employee_id}", response_model=schemas.EmployeeResponse)
def read_employee_by_id(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve a specific employee by their ID.
    """
    scope = AccessScope.of(current_user, include_own_location=True)
    stmt = select(models.Employee).options(
        joinedload(models.Employee.user), selectinload(models.Employee.position_links)
    ).where(models.Employee.id == employee_id, scope.location_filter(models.Employee.location_id))
    employee = db.execute(stmt).scalar_one_or_none()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found or access denied"
        )
    return employee

# ==========================================
# Write Operations (Restricted to Admins ONLY)
# ==========================================

@router.post("/", response_model=schemas.EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(
    employee_in: schemas.EmployeeCreate,
    db: Session = Depends(get_db),
    # Guard: Admins, Managers, and Schedulers can create employees
    current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Create a new employee linked to a specific Location. (Admin only)
    """
    # 1. Verify that the location exists and fetch its parent Client eagerly
    location_stmt = (
        select(models.Location)
        .options(joinedload(models.Location.client))
        .where(models.Location.id == employee_in.location_id)
    )
    location = db.execute(location_stmt).scalar_one_or_none()

    # 2. A missing location and one outside the user's scope answer the same 404 (IDOR)
    if location is None or not AccessScope.of(current_user).covers(location):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found or access denied")

    # 3. The email must be free
    if user_service.email_taken(db, employee_in.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    try:
        with _commit_or_409_on_taken_email(db, employee_in.email, "Email already registered"):
            db_employee = employee_service.create_employee(db, employee_in, location)
        db.refresh(db_employee)
        return db_employee
    except (AppError, HTTPException):
        # An invalid role id (400) or a taken email (409): answers the client can act on
        raise
    except Exception:
        # Log the cause; the response doesn't echo exception (DB) text back to the client
        logger.exception("Failed to create employee")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create employee"
        )


@router.put("/{employee_id}", response_model=schemas.EmployeeResponse)
def update_employee(
        employee_id: int,
        employee_update: schemas.EmployeeUpdate,
        db: Session = Depends(get_db),
        # Guard: Admins, Managers, and Schedulers ONLY
        current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Update an existing employee's details.
    """
    # 1. The employee must be in the user's scope
    scope = AccessScope.of(current_user)
    stmt = select(models.Employee).where(
        models.Employee.id == employee_id, scope.location_filter(models.Employee.location_id)
    )
    db_employee = db.execute(stmt).scalar_one_or_none()
    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found or access denied")

    # 2. So must the location it moves to: for admins too, so a missing location is a 404, not a DB error
    if employee_update.location_id is not None:
        ensure_location_access(db, current_user, employee_update.location_id)

    # 3. A new email must be free (an employee without a login has no email to change)
    user_id = db_employee.user.id if db_employee.user else None
    email = employee_update.email if user_id is not None else None
    if email is not None and user_service.email_taken(db, email, exclude_user_id=user_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use by another user")

    with _commit_or_409_on_taken_email(db, email, "Email already in use by another user", exclude_user_id=user_id):
        employee_service.update_employee(db, db_employee, employee_update)
    db.refresh(db_employee)
    return db_employee


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(
        employee_id: int,
        db: Session = Depends(get_db),
        # Guard: Admins, Managers, and Schedulers ONLY
        current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Hard delete an employee.
    """
    scope = AccessScope.of(current_user)
    stmt = select(models.Employee).where(
        models.Employee.id == employee_id, scope.location_filter(models.Employee.location_id)
    )


    db_employee = db.execute(stmt).scalar_one_or_none()

    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found or access denied")

    try:
        employee_service.delete_employee(db, db_employee)
        db.commit()
    except Exception:
        db.rollback()
        # Log the cause; the response doesn't echo exception (DB) text back to the client
        logger.exception(f"Failed to delete employee {employee_id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete employee"
        )

    return None


@router.put("/{employee_id}/settings", response_model=schemas.EmployeeSettingsResponse)
def update_employee_settings(
    employee_id: int,
    settings_in: schemas.EmployeeSettingsUpdate,
    db: Session = Depends(get_db),

    # Guard: Admins, Managers, and Schedulers can update settings
    current_user: models.User = Depends(get_current_scheduler_user)
):
    """Update the optimization rules and preferences of one employee (partial update)."""

    # Only the settings of an employee in the user's scope
    scope = AccessScope.of(current_user)
    stmt = (
        select(models.EmployeeSettings)
        .join(models.Employee)
        .where(
            models.EmployeeSettings.employee_id == employee_id,
            scope.location_filter(models.Employee.location_id),
        )
    )


    # 4. Execute the statement and fetch the scalar result
    db_settings = db.execute(stmt).scalar_one_or_none()

    if not db_settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee settings not found or access denied"
        )

    # Update only the fields that were provided in the request
    update_data = settings_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_settings, key, value)

    db.commit()
    db.refresh(db_settings)

    return db_settings