from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

# Import DB dependency
from app.core.database import get_db
# Import Schemas (Pydantic) and Models (SQLAlchemy)
from app.core import schemas, models
# Import CRUD utils
from app import crud

router = APIRouter()

@router.post("/", response_model=schemas.EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(employee: schemas.EmployeeCreate, db: Session = Depends(get_db)):
    """
    Create a new employee in the database.
    currently hardcoded to workplace_id=1 for simplicity.
    """
    # Check if employee already exists (optional logic, skipped for now)
    return crud.create_employee(db=db, employee=employee, workplace_id=1)

@router.get("/", response_model=List[schemas.EmployeeResponse])
def read_employees(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Retrieve a list of employees with pagination.
    """
    employees = db.query(models.Employee).offset(skip).limit(limit).all()
    return employees

@router.get("/{employee_id}", response_model=schemas.EmployeeResponse)
def read_employee(employee_id: int, db: Session = Depends(get_db)):
    """
    Get a specific employee by ID.
    """
    db_employee = crud.get_employee(db, employee_id=employee_id)
    if db_employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return db_employee

@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(employee_id: int, db: Session = Depends(get_db)):
    """
    Delete an employee by ID.
    """
    db_employee = crud.delete_employee(db, employee_id)
    if db_employee is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return None