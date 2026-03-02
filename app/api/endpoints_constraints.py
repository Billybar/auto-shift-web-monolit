from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List
from datetime import date

from app.core import models, schemas
from app.core.database import get_db
from app.api.dependencies import get_current_user

router = APIRouter()


def _verify_employee_access(current_user: models.User, target_employee_id: int):
    """
    Helper function to ensure a user can only access their own constraints,
    unless they are an Admin.
    """
    if current_user.role != schemas.RoleEnum.ADMIN:
        if current_user.employee_id != target_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access constraints for this employee."
            )


@router.get("/", response_model=List[schemas.ConstraintResponse])
def read_constraints(
        employee_id: int,
        start_date: date = None,
        end_date: date = None,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve constraints for a specific employee.
    Can be filtered by an optional date range.
    """
    _verify_employee_access(current_user, employee_id)

    stmt = select(models.WeeklyConstraint).where(
        models.WeeklyConstraint.employee_id == employee_id
    )

    if start_date:
        stmt = stmt.where(models.WeeklyConstraint.date >= start_date)
    if end_date:
        stmt = stmt.where(models.WeeklyConstraint.date <= end_date)

    constraints = db.execute(stmt).scalars().all()
    return constraints


@router.post("/", response_model=schemas.ConstraintResponse, status_code=status.HTTP_201_CREATED)
def create_constraint(
        constraint_in: schemas.ConstraintCreate,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    """
    Submit a new weekly constraint (e.g., CANNOT_WORK, MUST_WORK).
    """
    _verify_employee_access(current_user, constraint_in.employee_id)

    # Verify that the shift_id exists
    shift_stmt = select(models.ShiftDefinition).where(models.ShiftDefinition.id == constraint_in.shift_id)
    shift = db.execute(shift_stmt).scalar_one_or_none()

    if not shift:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Shift not found")

    # Verify that the employee_id exists
    emp_stmt = select(models.Employee).where(models.Employee.id == constraint_in.employee_id)
    emp = db.execute(emp_stmt).scalar_one_or_none()

    if not emp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Employee not found")

    # Prevent duplicate constraints for the exact same employee, shift, and date
    duplicate_stmt = select(models.WeeklyConstraint).where(
        models.WeeklyConstraint.employee_id == constraint_in.employee_id,
        models.WeeklyConstraint.shift_id == constraint_in.shift_id,
        models.WeeklyConstraint.date == constraint_in.date
    )
    if db.execute(duplicate_stmt).scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Constraint already exists for this shift and date."
        )

    db_constraint = models.WeeklyConstraint(
        employee_id=constraint_in.employee_id,
        shift_id=constraint_in.shift_id,
        date=constraint_in.date,
        constraint_type=constraint_in.constraint_type
    )

    db.add(db_constraint)
    db.commit()
    db.refresh(db_constraint)

    return db_constraint


@router.delete("/{constraint_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_constraint(
        constraint_id: int,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    """
    Delete a specific constraint.
    """
    stmt = select(models.WeeklyConstraint).where(models.WeeklyConstraint.id == constraint_id)
    db_constraint = db.execute(stmt).scalar_one_or_none()

    if not db_constraint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Constraint not found")

    # Verify access before deleting
    _verify_employee_access(current_user, db_constraint.employee_id)

    db.delete(db_constraint)
    db.commit()
    return None