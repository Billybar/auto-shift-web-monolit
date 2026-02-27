from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List, Optional

from app.core import models, schemas
from app.core.database import get_db

# Import our security dependencies
from app.api.dependencies import get_current_user, get_current_admin_user

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

    # Guard: Must be a logged-in user (Admin or Employee)
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve all employees. Optionally filter by location_id.
    """
    # Create the base selection statement
    stmt = select(models.Employee)

    # Dynamic filtering
    if location_id:
        stmt = stmt.where(models.Employee.location_id == location_id)

    # Pagination: offset and limit
    stmt = stmt.offset(skip).limit(limit)

    # Execute statement and fetch scalar objects
    result = db.execute(stmt)
    employees = result.scalars().all()

    return employees


@router.get("/{employee_id}", response_model=schemas.EmployeeResponse)
def read_employee_by_id(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve a specific employee by their ID.
    """
    # Building the statement
    stmt = select(models.Employee).where(models.Employee.id == employee_id)

    # Executing and getting a single result (or None)
    result = db.execute(stmt)
    employee = result.scalar_one_or_none()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
    return employee


# ==========================================
# Write Operations (Restricted to Admins ONLY)
# ==========================================

@router.post("/", response_model=schemas.EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(
    employee_in: schemas.EmployeeCreate,
    db: Session = Depends(get_db),
    # Guard: ONLY Admins can create employees
    current_admin: models.User = Depends(get_current_admin_user)
):
    """
    Create a new employee linked to a specific Location. (Admin only)
    """
    # 1. Verify that the location exists
    location_stmt = select(models.Location).where(models.Location.id == employee_in.location_id)
    location = db.execute(location_stmt).scalar_one_or_none()

    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    # 2. Create the employee record
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
    employee_update: schemas.EmployeeCreate, # Using Create schema for full update, or create a specific Update schema
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin_user)
):
    """
    Update an existing employee's details. (Admin only)
    """
    stmt = select(models.Employee).where(models.Employee.id == employee_id)
    db_employee = db.execute(stmt).scalar_one_or_none()

    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    # Update fields
    db_employee.name = employee_update.name
    db_employee.location_id = employee_update.location_id
    db_employee.color = employee_update.color
    db_employee.is_active = employee_update.is_active

    db.commit()
    db.refresh(db_employee)
    return db_employee


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def update_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin_user)
):
    """
    Soft delete or hard delete an employee.
    Here we implement a hard delete, but soft delete (is_active=False) is often preferred.
    """
    stmt = select(models.Employee).where(models.Employee.id == employee_id)
    db_employee = db.execute(stmt).scalar_one_or_none()

    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    db.delete(db_employee)
    db.commit()
    return None  # Returns 204 No Content