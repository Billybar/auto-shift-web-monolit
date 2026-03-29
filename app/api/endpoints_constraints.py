from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from typing import List
from datetime import date

from app.core import models, schemas
from app.core.database import get_db
from app.api.dependencies import get_current_user, get_current_scheduler_user
from app.core.enums import ConstraintSource
from app.services import constraints_import_service

router = APIRouter()


def _verify_employee_access(db: Session, current_user: models.User, target_employee_id: int):
    """
    Helper function to ensure a user can access an employee's constraints.
    Admins see all. Employees see only themselves. Managers/Schedulers see their permitted locations.
    """
    if current_user.role == schemas.RoleEnum.ADMIN:
        return

    # Regular employees can only access their own profile
    if current_user.role == schemas.RoleEnum.EMPLOYEE:
        if current_user.employee_id != target_employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized. You can only access your own constraints."
            )
        return

    # Managers and Schedulers: Check if the employee belongs to their permitted locations/clients
    allowed_location_ids = [loc.id for loc in current_user.locations]
    allowed_client_ids = [client.id for client in current_user.clients]

    stmt = select(models.Employee).join(models.Location).where(
        models.Employee.id == target_employee_id,
        (models.Employee.location_id.in_(allowed_location_ids)) |
        (models.Location.client_id.in_(allowed_client_ids))
    )

    if not db.execute(stmt).scalar_one_or_none():
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
    Retrieve constraints for a specific employee within a specific date range.
    """
    # Pass 'db' to the updated helper function
    _verify_employee_access(db, current_user, employee_id)

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
    _verify_employee_access(db,current_user, employee_id)

    # 1. Validation: Ensure all constraints belong to the requested employee and date range
    for constraint in constraints_in:
        if constraint.employee_id != employee_id:
            raise HTTPException(status_code=400, detail="Constraint employee_id mismatch.")
        if constraint.date < start_date or constraint.date > end_date:
            raise HTTPException(status_code=400, detail="Constraint date out of the sync range.")

        # Enforce RBAC: Regular employees cannot force a 'MUST_WORK' constraint
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
    db: Session = Depends(get_db),
    # Guard: Only Schedulers, Managers, and Admins can import files
    current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Uploads an HTML file from an external source, parses it, and updates the current week's constraints.
    Returns a warning if constraints were submitted for unregistered employees.
    """
    # 0. RBAC Location Check
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        loc_stmt = select(models.Location.client_id).where(models.Location.id == location_id)
        loc_client_id = db.execute(loc_stmt).scalar_one_or_none()

        if location_id not in allowed_location_ids and loc_client_id not in allowed_client_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to import constraints for this location."
            )

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