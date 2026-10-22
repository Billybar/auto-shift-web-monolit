"""
Assignments API Endpoints

Architecture Note: Why "Smart Sync" (Declarative) instead of Classic CRUD?
-------------------------------------------------------------------------
When managing a weekly schedule containing dozens of interconnected shifts,
a standard RESTful CRUD approach (POST for create, PUT for update, DELETE for remove)
presents several challenges:

1. Complex Frontend State Management: The client UI would need to calculate exact
   diffs (what was added, changed, or deleted) and orchestrate multiple HTTP requests.
2. Network Overhead: Making multiple separate API calls for bulk shift changes
   is slow, inefficient, and degrades user experience.
3. Transaction Safety (Partial Failures): If the client sends 20 individual CRUD
   requests and one fails midway due to network issues, the database is left in an
   inconsistent state (partial schedule saved).

The Solution: The "Smart Sync" Approach
The frontend sends the *desired final state* of the schedule for a specific date range
in a single request. The backend compares this incoming state to the current database
state, calculates the differences, and performs all necessary INSERTS and DELETES
within a single, atomic database transaction.
This guarantees 100% data consistency, minimizes network traffic, preserves historical
shift IDs, and provides an idempotent endpoint (safe to call multiple times).

Each row also carries the role (position) the employee fills; changing it updates the row in place.
The logic lives in app/services/assignment_sync_service.py.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List
from datetime import date, timedelta, datetime

from app.api.access import ensure_location_access
from app.core import models, schemas
from app.core.database import get_db
from app.services import assignment_sync_service
from app.services.weekly_schedule_service import generate_weekly_schedule

# Security Dependencies
from app.api.dependencies import (
    get_current_user,
    get_current_admin_user,
    get_current_scheduler_user
)

router = APIRouter()

def _week_start(d: date) -> date:
    """Returns the Sunday starting the week of the given date (Israeli week)."""
    return d - timedelta(days=(d.weekday() + 1) % 7)

@router.get("/", response_model=List[schemas.AssignmentResponse])
def read_assignments(
    location_id: int,
    start_date: date,
    end_date: date,
    employee_id: int = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve the working schedule (assignments) for a specific location and date range.
    Access restricted based on user role and permitted locations.
    """
    # 1. RBAC Check: Ensure user has access to this location (employees: their own location)
    ensure_location_access(db, current_user, location_id, allow_own_employee_location=True)

    # 2. Build and execute query
    stmt = select(models.Assignment).where(
        models.Assignment.location_id == location_id,
        models.Assignment.date >= start_date,
        models.Assignment.date <= end_date
    )

    # Optional filter to fetch assignments for a specific employee
    if employee_id:
        stmt = stmt.where(models.Assignment.employee_id == employee_id)

    assignments = db.execute(stmt).scalars().all()

    # Filter out draft weeks for regular employees
    if current_user.role == schemas.RoleEnum.EMPLOYEE:
        involved_weeks = {_week_start(a.date) for a in assignments}
        if involved_weeks:
            pub_stmt = select(models.ScheduleWeek.week_start_date).where(
                models.ScheduleWeek.location_id == location_id,
                models.ScheduleWeek.week_start_date.in_(involved_weeks),
                models.ScheduleWeek.is_published == True
            )
            published_weeks = set(db.execute(pub_stmt).scalars().all())
            assignments = [a for a in assignments if _week_start(a.date) in published_weeks]

    return assignments

# Added GET and PUT endpoints for schedule publication status
@router.get("/publication", response_model=schemas.SchedulePublicationResponse)
def get_schedule_publication(
    location_id: int,
    week_start_date: date,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get the publish status of a specific week."""
    ensure_location_access(db, current_user, location_id, allow_own_employee_location=True)
    
    stmt = select(models.ScheduleWeek).where(
        models.ScheduleWeek.location_id == location_id,
        models.ScheduleWeek.week_start_date == week_start_date
    )
    schedule_week = db.execute(stmt).scalar_one_or_none()
    
    if schedule_week:
        return schedule_week
        
    # Default draft response if no row exists
    return schemas.SchedulePublicationResponse(
        location_id=location_id,
        week_start_date=week_start_date,
        is_published=False
    )

@router.put("/publication", response_model=schemas.SchedulePublicationResponse)
def set_schedule_publication(
    payload: schemas.SchedulePublicationUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_scheduler_user)
):
    """Publish or unpublish a specific week."""
    ensure_location_access(db, current_user, payload.location_id, allow_own_employee_location=False)
    
    stmt = select(models.ScheduleWeek).where(
        models.ScheduleWeek.location_id == payload.location_id,
        models.ScheduleWeek.week_start_date == payload.week_start_date
    )
    schedule_week = db.execute(stmt).scalar_one_or_none()
    
    now = datetime.now()
    if schedule_week:
        schedule_week.is_published = payload.is_published
        if payload.is_published:
            schedule_week.published_at = now
            schedule_week.published_by_user_id = current_user.id
        else:
            schedule_week.published_at = None
            schedule_week.published_by_user_id = None
    else:
        schedule_week = models.ScheduleWeek(
            location_id=payload.location_id,
            week_start_date=payload.week_start_date,
            is_published=payload.is_published,
            published_at=now if payload.is_published else None,
            published_by_user_id=current_user.id if payload.is_published else None
        )
        db.add(schedule_week)
        
    db.commit()
    db.refresh(schedule_week)
    return schedule_week

@router.post("/", response_model=schemas.AssignmentSyncResponse, status_code=status.HTTP_200_OK)
def sync_weekly_assignments(
    location_id: int,
    start_date: date,
    end_date: date,
    assignments_in: List[schemas.AssignmentCreate],
    db: Session = Depends(get_db),

    # Guard: Admins, Managers, and Schedulers can sync schedules
    current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Smart synchronization of the schedule for [start_date, end_date].
    Adds new rows, removes the ones left out, and updates role and hours in place, so existing
    rows keep their database IDs. A row without position_id keeps its role, or gets one inferred
    when new (installed mobile builds never send it).
    Returns 422 for duplicate rows, dates outside the range, or employees / shifts / roles of
    another location, and 409 (schedule_concurrent_edit) when another save got in first.
    """
    ensure_location_access(db, current_user, location_id)

    try:
        return assignment_sync_service.sync_assignments(db, location_id, start_date, end_date, assignments_in)
    except assignment_sync_service.SyncValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@router.post("/auto-generate/{location_id}", response_model=schemas.AutoScheduleResponse, status_code=status.HTTP_200_OK)
def run_auto_shift(
        location_id: int,
        start_date: date,
        db: Session = Depends(get_db),
        # Guard: Admins, Managers, and Schedulers can run optimization
        current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Run the scheduling engine for the week starting at start_date and return a draft
    (nothing is saved). Slots that can't be filled come back in unfilled_slots, and inputs the
    engine had to set aside (employees without roles, impossible MUST_WORK, lowered minimums)
    in warnings.
    """
    ensure_location_access(db, current_user, location_id)

    return generate_weekly_schedule(db, location_id, start_date)
