from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core import models, schemas
from app.core.database import get_db

router = APIRouter()


@router.get("/", response_model=List[schemas.EmployeeResponse])
def read_employees(
        location_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
        db: Session = Depends(get_db)
):
    """
    Retrieve all employees.
    Optionally filter by location_id.
    """
    query = db.query(models.Employee)

    if location_id:
        query = query.filter(models.Employee.location_id == location_id)

    employees = query.offset(skip).limit(limit).all()
    return employees


@router.post("/", response_model=schemas.EmployeeResponse)
def create_employee(employee: schemas.EmployeeCreate, db: Session = Depends(get_db)):
    """
    Create a new employee linked to a specific Location.
    """
    # 1. Verify that the location exists
    location = db.query(models.Location).filter(models.Location.id == employee.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

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