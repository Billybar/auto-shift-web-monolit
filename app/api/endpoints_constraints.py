import logging
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from typing import Dict, List, Tuple
from datetime import date

from app.core import models, schemas, shift_timing
from app.core.database import get_db
from app.api.dependencies import get_current_user, get_current_scheduler_user
from app.core.enums import ConstraintSource, ErrorCode
from app.core.errors import AppError
from app.services import constraints_import_service

logger = logging.getLogger(__name__)

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


@router.get("/", response_model=schemas.WeeklyDataResponse)
def read_constraints(
        employee_id: int,
        start_date: date = None,
        end_date: date = None,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve constraints for a specific employee within a specific date range.
    Each stored row covers a constraints-board row (a group), and is returned once per shift of
    the group, with both group_id and shift_id. Rows of a group with no shifts left (history)
    apply to nothing and are not returned.
    """
    # Pass 'db' to the updated helper function
    _verify_employee_access(db, current_user, employee_id)

    stmt = select(models.WeeklyConstraint).where(
        models.WeeklyConstraint.employee_id == employee_id,
        models.WeeklyConstraint.date >= start_date,
        models.WeeklyConstraint.date <= end_date
    )
    rows = db.execute(stmt).scalars().all()

    shifts_by_group: Dict[int, List[models.ShiftDefinition]] = {}
    group_ids = {row.group_id for row in rows}
    if group_ids:
        shifts = db.execute(
            select(models.ShiftDefinition).where(models.ShiftDefinition.constraint_group_id.in_(group_ids))
        ).scalars().all()
        for shift in sorted(shifts, key=shift_timing.display_key):
            shifts_by_group.setdefault(shift.constraint_group_id, []).append(shift)

    constraints = [
        schemas.WeeklyConstraintResponse(
            id=row.id,
            employee_id=row.employee_id,
            group_id=row.group_id,
            shift_id=shift.id,
            date=row.date,
            constraint_type=row.constraint_type,
        )
        for row in sorted(rows, key=lambda r: (r.date, r.id))
        for shift in shifts_by_group.get(row.group_id, [])
    ]

    # Fetch weekly note for the specified date
    note_stmt = select(models.WeeklyNote).where(
        models.WeeklyNote.employee_id == employee_id,
        models.WeeklyNote.week_start_date == start_date
    )
    weekly_note_obj = db.execute(note_stmt).scalar_one_or_none()
    note_text = weekly_note_obj.note if weekly_note_obj else None

    # Return data wrapped in the new response model
    return schemas.WeeklyDataResponse(
        constraints=constraints,
        note=note_text
    )


@router.post("/sync", status_code=status.HTTP_200_OK)
def sync_weekly_constraints(
        employee_id: int,
        start_date: date,
        end_date: date,
        payload: schemas.SyncConstraintsPayload,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    """
    Sync all constraints for an employee for a specific date range: the payload is the desired
    state of the employee's constraints board (State Replacement Strategy).

    Each item names a board row by group_id, or by shift_id (installed mobile builds), which is
    read as the shift's group; items that land on the same row and date must agree. Rows of the
    employee's current board in the range are replaced. Rows of groups that are no longer on it
    (history kept by a merge, or another location) are left untouched.
    """
    _verify_employee_access(db,current_user, employee_id)

    employee = db.execute(select(models.Employee).where(models.Employee.id == employee_id)).scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found or access denied")

    # The board of the employee's location: shift -> its row (group)
    shift_to_group = dict(db.execute(
        select(models.ShiftDefinition.id, models.ShiftDefinition.constraint_group_id)
        .where(models.ShiftDefinition.location_id == employee.location_id)
    ).tuples().all())
    board_group_ids = set(shift_to_group.values())

    # 1. Validation: Ensure all constraints belong to the requested employee, date range and board
    wanted: Dict[Tuple[int, date], schemas.ConstraintType] = {}
    for constraint in payload.constraints:
        if constraint.employee_id != employee_id:
            raise HTTPException(status_code=400, detail="Constraint employee_id mismatch.")
        if constraint.date < start_date or constraint.date > end_date:
            raise HTTPException(status_code=400, detail="Constraint date out of the sync range.")

        # Enforce RBAC: Regular employees cannot force a 'MUST_WORK' constraint
        if constraint.constraint_type == schemas.ConstraintType.MUST_WORK:
            if current_user.role != schemas.RoleEnum.ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized. Only administrators can set a 'MUST_WORK' constraint."
                )

        group_id = constraint.group_id if constraint.group_id is not None else shift_to_group.get(constraint.shift_id)
        if group_id not in board_group_ids:
            raise HTTPException(
                status_code=400, detail="Constraint shift or group is not part of the employee's location."
            )
        if wanted.setdefault((group_id, constraint.date), constraint.constraint_type) != constraint.constraint_type:
            # e.g. an installed mobile build marking two shifts of one row differently
            raise HTTPException(status_code=400, detail="Conflicting constraints for the same board row and date.")

    # 2. Delete the existing constraints of this employee's board in this date range
    delete_stmt = delete(models.WeeklyConstraint).where(
        models.WeeklyConstraint.employee_id == employee_id,
        models.WeeklyConstraint.date >= start_date,
        models.WeeklyConstraint.date <= end_date,
        models.WeeklyConstraint.group_id.in_(board_group_ids),
    )
    db.execute(delete_stmt)

    # 3. Insert the new constraints (only the exceptions: CANNOT_WORK, MUST_WORK), one per row and date
    new_constraints = [
        models.WeeklyConstraint(employee_id=employee_id, group_id=group_id, date=on_date, constraint_type=c_type)
        for (group_id, on_date), c_type in wanted.items()
    ]
    db.add_all(new_constraints)

    # 4. Upsert the Weekly Note
    if payload.note is not None:
        note_stmt = select(models.WeeklyNote).where(
            models.WeeklyNote.employee_id == employee_id,
            models.WeeklyNote.week_start_date == start_date
        )
        existing_note = db.execute(note_stmt).scalar_one_or_none()

        if existing_note:
            # Update existing note
            existing_note.note = payload.note
        else:
            # Create new note
            new_note = models.WeeklyNote(
                employee_id=employee_id,
                week_start_date=start_date,
                note=payload.note
            )
            db.add(new_note)

    # Commit everything together atomically
    db.commit()

    return {
        "detail": "Constraints and note synced successfully",
        "saved_constraints_count": len(new_constraints)
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
        raise AppError(
            ErrorCode.IMPORT_INVALID_FILE_TYPE,
            "Invalid file format. Expected an HTML file.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # Step 1: Read raw bytes from upload (fails on IO errors)
    try:
        content = await file.read()
    except Exception as e:
        # Log the cause; the response doesn't echo exception text back to the client
        logger.exception("Failed to read uploaded constraints file")
        raise AppError(
            ErrorCode.IMPORT_UNREADABLE_FILE,
            "Failed to read file.",
            status_code=status.HTTP_400_BAD_REQUEST,
        ) from e

    # Step 2: Decode bytes to string with encoding fallback
    # (Mishmarot/Yalam files are usually Windows-1255, not UTF-8)
    html_content = None
    for enc in ('utf-8-sig', 'utf-8', 'windows-1255', 'iso-8859-8'):
        try:
            html_content = content.decode(enc)
            #logger.info(f"Decoded uploaded HTML using '{enc}' encoding.")
            break
        except UnicodeDecodeError:
            continue

    if html_content is None:
        raise AppError(
            ErrorCode.IMPORT_UNSUPPORTED_ENCODING,
            "Failed to decode file. Unsupported text encoding.",
            status_code=status.HTTP_400_BAD_REQUEST,
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