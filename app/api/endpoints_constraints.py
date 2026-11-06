import logging
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from typing import Dict, Hashable, Iterable, List, Optional, Set, Tuple
from datetime import date, timedelta

from app.core import models, schemas, shift_timing
from app.core.database import get_db
from app.api.dependencies import get_current_user, get_current_scheduler_user
from app.core.enums import ConstraintSource, ErrorCode
from app.core.errors import AppError
from app.services import constraints_import_service, default_constraints_service

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


def _has_location_access(db: Session, current_user: models.User, location_id: int) -> bool:
    """Admins reach every location; others the locations linked to them or to their clients."""
    if current_user.role == schemas.RoleEnum.ADMIN:
        return True
    if location_id in {loc.id for loc in current_user.locations}:
        return True
    loc_client_id = db.execute(
        select(models.Location.client_id).where(models.Location.id == location_id)
    ).scalar_one_or_none()
    return loc_client_id is not None and loc_client_id in {client.id for client in current_user.clients}


def _get_employee(db: Session, employee_id: int) -> models.Employee:
    employee = db.execute(select(models.Employee).where(models.Employee.id == employee_id)).scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found or access denied")
    return employee


def _can_set_must_work(current_user: models.User) -> bool:
    """Schedulers and above may set MUST_WORK (the employee's scope is checked separately)."""
    # A tuple, not a set: RoleEnum hashes by name, so a set would miss a role given as a plain str.
    return current_user.role in (schemas.RoleEnum.ADMIN, schemas.RoleEnum.MANAGER, schemas.RoleEnum.SCHEDULER)


def _validate_board_marks(
        marks: Iterable[Tuple[Optional[int], Hashable, schemas.ConstraintType]],
        board_group_ids: Set[int],
        can_set_must_work: bool,
        existing_must_work: Set[Tuple[int, Hashable]],
) -> Dict[Tuple[int, Hashable], schemas.ConstraintType]:
    """
    Validates the marks of a constraints board, given as (group_id, slot, type) where the slot is a
    date (a week) or a day of the week (the defaults). Returns (group_id, slot) -> type.
    - the group must be a row of the employee's board (400);
    - below scheduler, no new MUST_WORK: the payload is the whole board, so resending a MUST_WORK
      already on it is allowed, and so is clearing one (403);
    - marks that land on the same row and slot must agree, e.g. an installed mobile build marking
      two shifts of one row differently (400).
    """
    wanted: Dict[Tuple[int, Hashable], schemas.ConstraintType] = {}
    for group_id, slot, c_type in marks:
        if group_id not in board_group_ids:
            raise HTTPException(
                status_code=400, detail="Constraint shift or group is not part of the employee's location."
            )
        if (
            c_type == schemas.ConstraintType.MUST_WORK
            and not can_set_must_work
            and (group_id, slot) not in existing_must_work
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized. Only schedulers, managers and administrators can set a 'MUST_WORK' constraint."
            )
        if wanted.setdefault((group_id, slot), c_type) != c_type:
            raise HTTPException(status_code=400, detail="Conflicting constraints for the same board row and date.")
    return wanted


@router.get("/", response_model=schemas.WeeklyDataResponse)
def read_constraints(
        employee_id: int,
        start_date: date,
        end_date: date,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve constraints for a specific employee within a specific date range.
    Each mark covers a constraints-board row (a group), and is returned once per shift of the group,
    with both group_id and shift_id. Marks of a group with no shifts left (history) apply to nothing
    and are not returned.
    A week the employee hasn't submitted shows their default constraints (id None, uses_defaults).
    """
    _verify_employee_access(db, current_user, employee_id)

    marks, using_defaults = default_constraints_service.effective_constraints(db, [employee_id], start_date, end_date)

    shifts_by_group: Dict[int, List[models.ShiftDefinition]] = {}
    group_ids = {mark.group_id for mark in marks}
    if group_ids:
        shifts = db.execute(
            select(models.ShiftDefinition).where(models.ShiftDefinition.constraint_group_id.in_(group_ids))
        ).scalars().all()
        for shift in sorted(shifts, key=shift_timing.display_key):
            shifts_by_group.setdefault(shift.constraint_group_id, []).append(shift)

    constraints = [
        schemas.WeeklyConstraintResponse(
            id=mark.row_id,
            employee_id=mark.employee_id,
            group_id=mark.group_id,
            shift_id=shift.id,
            date=mark.date,
            constraint_type=mark.constraint_type,
        )
        for mark in sorted(marks, key=lambda m: (m.date, m.row_id or 0, m.group_id))
        for shift in shifts_by_group.get(mark.group_id, [])
    ]

    # Fetch weekly note for the specified date
    note_stmt = select(models.WeeklyNote).where(
        models.WeeklyNote.employee_id == employee_id,
        models.WeeklyNote.week_start_date == start_date
    )
    weekly_note_obj = db.execute(note_stmt).scalar_one_or_none()
    note_text = weekly_note_obj.note if weekly_note_obj else None

    return schemas.WeeklyDataResponse(
        constraints=constraints,
        note=note_text,
        uses_defaults=bool(using_defaults),
    )


@router.post("/sync", response_model=schemas.SyncConstraintsResponse, status_code=status.HTTP_200_OK)
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
    Saving submits the week: from then on it uses only what was saved, never the employee's defaults.
    """
    _verify_employee_access(db,current_user, employee_id)
    employee = _get_employee(db, employee_id)

    # The board of the employee's location: shift -> its row (group)
    shift_to_group = dict(db.execute(
        select(models.ShiftDefinition.id, models.ShiftDefinition.constraint_group_id)
        .where(models.ShiftDefinition.location_id == employee.location_id)
    ).tuples().all())
    board_group_ids = set(shift_to_group.values())

    # Below scheduler, only the MUST_WORK marks already on the board may be sent (unchanged): the
    # payload is the whole week, so an employee saving their board sends back the marks a manager
    # set on it, or the ones of their defaults when the week isn't submitted yet.
    can_set_must_work = _can_set_must_work(current_user)
    existing_must_work: Set[Tuple[int, date]] = set()
    if not can_set_must_work:
        marks, _ = default_constraints_service.effective_constraints(db, [employee_id], start_date, end_date)
        existing_must_work = {
            (mark.group_id, mark.date) for mark in marks if mark.constraint_type == schemas.ConstraintType.MUST_WORK
        }

    # 1. Validation: Ensure all constraints belong to the requested employee, date range and board
    for constraint in payload.constraints:
        if constraint.employee_id != employee_id:
            raise HTTPException(status_code=400, detail="Constraint employee_id mismatch.")
        if constraint.date < start_date or constraint.date > end_date:
            raise HTTPException(status_code=400, detail="Constraint date out of the sync range.")
    wanted = _validate_board_marks(
        (
            (
                constraint.group_id if constraint.group_id is not None else shift_to_group.get(constraint.shift_id),
                constraint.date,
                constraint.constraint_type,
            )
            for constraint in payload.constraints
        ),
        board_group_ids,
        can_set_must_work,
        existing_must_work,
    )

    # 2. Delete the existing constraints of this employee's board in this date range
    delete_stmt = delete(models.WeeklyConstraint).where(
        models.WeeklyConstraint.employee_id == employee_id,
        models.WeeklyConstraint.date >= start_date,
        models.WeeklyConstraint.date <= end_date,
        models.WeeklyConstraint.group_id.in_(board_group_ids),
    )
    db.execute(delete_stmt)

    # 3. Insert the new constraints (only the exceptions: CANNOT_WORK, MUST_WORK, PREFER_TO), one per row and date
    new_constraints = [
        models.WeeklyConstraint(employee_id=employee_id, group_id=group_id, date=on_date, constraint_type=c_type)
        for (group_id, on_date), c_type in wanted.items()
    ]
    db.add_all(new_constraints)

    # 4. Mark the week submitted, and upsert the weekly note when one was sent. The note is keyed by
    # start_date (a Sunday), as the read endpoint reads it; any further week the range covers is
    # marked too.
    default_constraints_service.mark_submitted(
        db, [employee_id], start_date,
        note=payload.note if payload.note is not None else default_constraints_service.UNSET,
    )
    other_weeks = {
        default_constraints_service.week_start_of(start_date + timedelta(days=offset))
        for offset in range((end_date - start_date).days + 1)
    } - {start_date}
    for week_start in sorted(other_weeks):
        default_constraints_service.mark_submitted(db, [employee_id], week_start)

    # Commit everything together atomically
    db.commit()

    return schemas.SyncConstraintsResponse(
        detail="Constraints and note synced successfully",
        saved_constraints_count=len(new_constraints),
    )


@router.get("/defaults", response_model=schemas.DefaultConstraintsResponse)
def read_default_constraints(
        employee_id: int,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    """
    The employee's default week: the marks every week they haven't submitted starts with.
    Employees read their own; schedulers and above read the employees in their scope.
    """
    _verify_employee_access(db, current_user, employee_id)
    employee = _get_employee(db, employee_id)
    return schemas.DefaultConstraintsResponse(
        employee_id=employee_id,
        constraints=[
            schemas.DefaultConstraintItem.model_validate(item)
            for item in default_constraints_service.get_template(db, employee)
        ],
    )


@router.put("/defaults", response_model=schemas.DefaultConstraintsResponse)
def replace_default_constraints(
        employee_id: int,
        payload: schemas.DefaultConstraintsPayload,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    """
    Replaces the employee's default week with the payload (state replacement, one mark per board
    row and day of week). Weeks already submitted keep what was saved; the others show the new
    defaults. Below scheduler, MUST_WORK marks may only be resent as they are.
    """
    _verify_employee_access(db, current_user, employee_id)
    employee = _get_employee(db, employee_id)

    current = default_constraints_service.get_template(db, employee)
    can_set_must_work = _can_set_must_work(current_user)
    existing_must_work = {
        (item.group_id, item.day_of_week)
        for item in current
        if item.constraint_type == schemas.ConstraintType.MUST_WORK
    }
    wanted = _validate_board_marks(
        ((item.group_id, item.day_of_week, item.constraint_type) for item in payload.constraints),
        default_constraints_service.board_group_ids(db, employee.location_id),
        can_set_must_work,
        existing_must_work,
    )

    default_constraints_service.replace_template(db, employee, wanted)
    db.commit()

    return schemas.DefaultConstraintsResponse(
        employee_id=employee_id,
        constraints=[
            schemas.DefaultConstraintItem.model_validate(item)
            for item in default_constraints_service.get_template(db, employee)
        ],
    )


@router.get("/submission-status", response_model=schemas.ConstraintSubmissionStatusResponse)
def read_submission_status(
        location_id: int,
        week_start: date,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    The active employees of the location who haven't submitted the week of week_start (any date of
    the week): their week shows their default constraints. A week that has ended, or was published,
    has none.
    """
    if not _has_location_access(db, current_user, location_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found or access denied")

    week_start = default_constraints_service.week_start_of(week_start)
    employee_ids = db.execute(
        select(models.Employee.id).where(
            models.Employee.location_id == location_id,
            models.Employee.is_active.is_(True),
        )
    ).scalars().all()
    _, using_defaults = default_constraints_service.effective_constraints(
        db, employee_ids, week_start, week_start + timedelta(days=6)
    )
    return schemas.ConstraintSubmissionStatusResponse(
        week_start=week_start,
        pending_employee_ids=sorted(emp_id for emp_id, _ in using_defaults),
    )


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
    if not _has_location_access(db, current_user, location_id):
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