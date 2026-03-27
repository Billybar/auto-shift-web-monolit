from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List, Optional

from app.core import models, schemas
from app.core.database import get_db

# Import our security dependencies
from app.api.dependencies import (
    get_current_user,
    get_current_admin_user,
    get_current_manager_user,
    get_current_scheduler_user
)

router = APIRouter()

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
    stmt = select(models.Employee)

    # Apply RBAC Data Filtering for non-admins
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        # Allow regular employees to see their own location's staff
        if current_user.role == schemas.RoleEnum.EMPLOYEE and current_user.employee_id:
            allowed_location_ids.append(current_user.employee.location_id)

        # Join with Location to filter securely
        stmt = stmt.join(models.Location).where(
            (models.Employee.location_id.in_(allowed_location_ids)) |
            (models.Location.client_id.in_(allowed_client_ids))
        )

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
    stmt = select(models.Employee).where(models.Employee.id == employee_id)

    # Apply RBAC Data Filtering for non-admins (Prevent IDOR vulnerability)
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        if current_user.role == schemas.RoleEnum.EMPLOYEE and current_user.employee_id:
            allowed_location_ids.append(current_user.employee.location_id)

        stmt = stmt.join(models.Location).where(
            (models.Employee.location_id.in_(allowed_location_ids)) |
            (models.Location.client_id.in_(allowed_client_ids))
        )

    result = db.execute(stmt)
    employee = result.scalar_one_or_none()

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
    # 1. Verify that the location exists
    location_stmt = select(models.Location).where(models.Location.id == employee_in.location_id)
    location = db.execute(location_stmt).scalar_one_or_none()

    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    # 2. RBAC Check: Ensure the user is authorized for this specific location
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        if location.id not in allowed_location_ids and location.client_id not in allowed_client_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to add employees to this location"
            )

    # 3. Create the employee record
    db_employee = models.Employee(
        name=employee_in.name,
        location_id=employee_in.location_id,
        color=employee_in.color,
        is_active=employee_in.is_active
    )

    # 3. Initialize default settings for this employee
    # This ensures they always have a settings record linked.
    default_settings = models.EmployeeSettings(
        employee=db_employee,
        min_shifts_per_week=0,
        max_shifts_per_week=6
    )

    db.add(db_employee)
    db.add(default_settings)
    db.commit()
    db.refresh(db_employee)

    return db_employee


@router.put("/{employee_id}", response_model=schemas.EmployeeResponse)
def update_employee(
        employee_id: int,
        employee_update: schemas.EmployeeCreate,
        db: Session = Depends(get_db),
        # Guard: Admins, Managers, and Schedulers ONLY
        current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Update an existing employee's details.
    """
    stmt = select(models.Employee).where(models.Employee.id == employee_id)

    # Apply RBAC Data Filtering for non-admins
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        # 1. Verify access to the EXISTING employee
        stmt = stmt.join(models.Location).where(
            (models.Employee.location_id.in_(allowed_location_ids)) |
            (models.Location.client_id.in_(allowed_client_ids))
        )

        # 2. Security Check: Verify access to the NEW location_id
        new_loc_stmt = select(models.Location).where(models.Location.id == employee_update.location_id)
        new_loc = db.execute(new_loc_stmt).scalar_one_or_none()

        if not new_loc or (new_loc.id not in allowed_location_ids and new_loc.client_id not in allowed_client_ids):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to move employee to this new location"
            )

    db_employee = db.execute(stmt).scalar_one_or_none()

    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found or access denied")

    # Update fields
    db_employee.name = employee_update.name
    db_employee.location_id = employee_update.location_id
    db_employee.color = employee_update.color
    db_employee.is_active = employee_update.is_active

    db.commit()
    db.refresh(db_employee)
    return db_employee


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(  # FIXED: Renamed function
        employee_id: int,
        db: Session = Depends(get_db),
        # Guard: Admins, Managers, and Schedulers ONLY
        current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Hard delete an employee.
    """
    stmt = select(models.Employee).where(models.Employee.id == employee_id)

    # Apply RBAC Data Filtering for non-admins
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        stmt = stmt.join(models.Location).where(
            (models.Employee.location_id.in_(allowed_location_ids)) |
            (models.Location.client_id.in_(allowed_client_ids))
        )

    db_employee = db.execute(stmt).scalar_one_or_none()

    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found or access denied")

    db.delete(db_employee)
    db.commit()
    return None


@router.put("/{employee_id}/settings", response_model=schemas.EmployeeSettingsResponse)
def update_employee_settings(
    employee_id: int,
    settings_in: schemas.EmployeeSettingsUpdate,
    db: Session = Depends(get_db),

    # Guard: Admins, Managers, and Schedulers can update settings
    current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Update optimization rules and preferences for a specific employee.
    ... (docstrings remain exactly the same) ...
    """
    # 1. Build the query using SQLAlchemy 2.0 syntax
    stmt = select(models.EmployeeSettings)

    # 2. Apply RBAC Data Filtering for non-admins
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        # Join Employee and Location to verify access rights securely in the DB layer
        stmt = stmt.join(models.Employee).join(models.Location).where(
            (models.Employee.location_id.in_(allowed_location_ids)) |
            (models.Location.client_id.in_(allowed_client_ids))
        )

    # 3. Filter by the specific employee_id
    stmt = stmt.where(models.EmployeeSettings.employee_id == employee_id)

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