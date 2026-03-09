from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
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


@router.get("/", response_model=List[schemas.WeeklyConstraintResponse])
def read_constraints(
        employee_id: int,
        start_date: date = None,
        end_date: date = None,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve constraints for a specific employee within a specific date range (e.g., a week).
    """
    _verify_employee_access(current_user, employee_id)

    stmt = select(models.WeeklyConstraint).where(
        models.WeeklyConstraint.employee_id == employee_id,
        models.WeeklyConstraint.date >= start_date,
        models.WeeklyConstraint.date <= end_date
    )

    constraints = db.execute(stmt).scalars().all()
    return constraints


@router.post("/sync", status_code=status.HTTP_200_OK)
def sync_weekly_constraints(
        employee_id: int,
        start_date: date,
        end_date: date,
        constraints_in: List[schemas.WeeklyConstraintCreate],
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    """
    Sync all constraints for an employee for a specific date range.
    This deletes any existing constraints in that range and inserts the new ones.
    (State Replacement Strategy)
    """
    _verify_employee_access(current_user, employee_id)

    # 1. Validation: Ensure all constraints belong to the requested employee and date range
    for constraint in constraints_in:
        if constraint.employee_id != employee_id:
            raise HTTPException(status_code=400, detail="Constraint employee_id mismatch.")
        if constraint.date < start_date or constraint.date > end_date:
            raise HTTPException(status_code=400, detail="Constraint date out of the sync range.")

    # 2. Delete all existing constraints for this employee in this date range
    delete_stmt = delete(models.WeeklyConstraint).where(
        models.WeeklyConstraint.employee_id == employee_id,
        models.WeeklyConstraint.date >= start_date,
        models.WeeklyConstraint.date <= end_date
    )
    db.execute(delete_stmt)

    # 3. Insert the new constraints (only the exceptions: CANNOT_WORK, MUST_WORK)
    new_constraints = [
        models.WeeklyConstraint(**c.model_dump())
        for c in constraints_in
    ]
    db.add_all(new_constraints)
    db.commit()

    return {
        "detail": "Constraints synced successfully",
        "saved_count": len(new_constraints)
    }