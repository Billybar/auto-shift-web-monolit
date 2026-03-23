from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from typing import List
from datetime import date

from app.core import models, schemas
from app.core.database import get_db
from app.api.dependencies import get_current_user
from app.core.schemas import ConstraintSource
from app.services import constraints_import_service

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
        # Enforce RBAC: Only Admins can set MUST_WORK constraints
        if constraint.constraint_type == schemas.ConstraintTypeEnum.MUST_WORK:
            if current_user.role != schemas.RoleEnum.ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized. Only administrators can set a 'MUST_WORK' constraint."
                )

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

@router.post("/import-html", status_code=status.HTTP_200_OK)
async def import_constraints_from_html(
    source: ConstraintSource = Form(...),
    start_of_week: date = Form(...), # NEW: Required to calculate exact dates
    location_id: int = Form(...),    # NEW: Required to fetch correct shifts & employees
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Uploads an HTML file from an external source, parses it, and updates the current week's constraints.
    Returns a warning if constraints were submitted for unregistered employees.
    """
    # 1. Validate file extension
    if not file.filename.lower().endswith(('.html', '.htm')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Expected an HTML file."
        )

    # 2. Read file content into memory
    try:
        content = await file.read()
        html_content = content.decode('utf-8')
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read file: {str(e)}"
        )

    # 3. Call the service layer with the additional parameters
    result = constraints_import_service.process_external_constraints(
        db=db,
        html_content=html_content,
        source=source,
        start_of_week=start_of_week,
        location_id=location_id
    )

    return result