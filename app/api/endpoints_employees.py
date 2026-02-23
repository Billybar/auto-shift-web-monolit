from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
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
    query = db.query(models.Employee)

    if location_id:
        query = query.filter(models.Employee.location_id == location_id)

    employees = query.offset(skip).limit(limit).all()
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
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return employee


# ==========================================
# Write Operations (Restricted to Admins ONLY)
# ==========================================

@router.post("/", response_model=schemas.EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(
    employee: schemas.EmployeeCreate,
    db: Session = Depends(get_db),
    # Guard: ONLY Admins can create employees
    current_admin: models.User = Depends(get_current_admin_user)
):
    """
    Create a new employee linked to a specific Location. (Admin only)
    """
    # 1. Verify that the location exists
    location = db.query(models.Location).filter(models.Location.id == employee.location_id).first()
    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    # 2. Create the employee record
    db_employee = models.Employee(
        name=employee.name,
        location_id=employee.location_id,
        color=employee.color,
        is_active=employee.is_active
    )
    db.add(db_employee)
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
    db_employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
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
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin_user)
):
    """
    Soft delete or hard delete an employee.
    Here we implement a hard delete, but soft delete (is_active=False) is often preferred.
    """
    db_employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    db.delete(db_employee)
    db.commit()
    return # 204 No Content response requires no body