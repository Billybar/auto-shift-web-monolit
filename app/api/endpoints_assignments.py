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
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List
from datetime import date, timedelta, datetime

from app.core import models, schemas
from app.core.database import get_db
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

def _ensure_location_access(db: Session, user: models.User, location_id: int, allow_own_employee_location: bool):
    """Checks access and raises 404 to avoid leaking location existence."""
    if user.role == schemas.RoleEnum.ADMIN:
        return

    allowed_location_ids = [loc.id for loc in user.locations]
    allowed_client_ids = [client.id for client in user.clients]

    is_own_location = (
        allow_own_employee_location 
        and user.role == schemas.RoleEnum.EMPLOYEE 
        and user.employee_id 
        and user.employee 
        and user.employee.location_id == location_id
    )

    loc_stmt = select(models.Location.client_id).where(models.Location.id == location_id)
    loc_client_id = db.execute(loc_stmt).scalar_one_or_none()

    if not is_own_location and location_id not in allowed_location_ids and loc_client_id not in allowed_client_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found or access denied"
        )
    
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
    # 1. RBAC Check: Ensure user has access to this location
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        # Check if it's a regular employee querying their own location
        is_own_location = (
            current_user.role == schemas.RoleEnum.EMPLOYEE
            and current_user.employee_id
            and current_user.employee.location_id == location_id
        )

        # Fetch the location's client_id to verify M2M client access
        loc_stmt = select(models.Location.client_id).where(models.Location.id == location_id)
        loc_client_id = db.execute(loc_stmt).scalar_one_or_none()

        if not is_own_location and location_id not in allowed_location_ids and loc_client_id not in allowed_client_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to view schedule for this location"
            )

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
    _ensure_location_access(db, current_user, location_id, allow_own_employee_location=True)
    
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
    _ensure_location_access(db, current_user, payload.location_id, allow_own_employee_location=False)
    
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

@router.post("/", status_code=status.HTTP_200_OK)
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
    Smart synchronization of the weekly schedule.
    Adds new shifts, removes deleted shifts, and keeps existing shifts intact
    to preserve their original database IDs.
    Restricted RBAC to ensure users only modify their permitted locations..
    """
    # 1. RBAC Check: Ensure user has access to modify this location
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        loc_stmt = select(models.Location.client_id).where(models.Location.id == location_id)
        loc_client_id = db.execute(loc_stmt).scalar_one_or_none()

        if location_id not in allowed_location_ids and loc_client_id not in allowed_client_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to modify the schedule for this location"
            )

    # 2. Fetch all existing assignments within the specified date range
    stmt = select(models.Assignment).where(
        models.Assignment.location_id == location_id,
        models.Assignment.date >= start_date,
        models.Assignment.date <= end_date
    )
    existing_assignments = db.execute(stmt).scalars().all()

    # Map existing assignments using a unique key: (employee_id, shift_id, date)
    # This allows for O(1) lookup time during the comparison phase
    existing_map = {
        (a.employee_id, a.shift_id, a.date): a for a in existing_assignments
    }

    incoming_keys = set()
    added_count = 0

    # 2. Identify and insert or update assignments
    for a in assignments_in:
        key = (a.employee_id, a.shift_id, a.date)
        incoming_keys.add(key)

        if key not in existing_map:
            # This is a completely new shift added by the frontend
            new_db_assignment = models.Assignment(
                location_id=location_id,
                employee_id=a.employee_id,
                shift_id=a.shift_id,
                date=a.date,
                start_time=a.start_time,
                end_time=a.end_time
            )
            db.add(new_db_assignment)
            added_count += 1
        else:
            # Shift exists, check if hours changed
            db_obj = existing_map[key]
            if db_obj.start_time != a.start_time or db_obj.end_time != a.end_time:
                db_obj.start_time = a.start_time
                db_obj.end_time = a.end_time

    # 3. Identify and delete assignments that were removed from the frontend's state
    removed_count = 0
    for key, db_obj in existing_map.items():
        if key not in incoming_keys:
            # The shift exists in the DB but was not sent in the payload, hence it was deleted
            db.delete(db_obj)
            removed_count += 1

    # Commit all changes (inserts and deletes) in a single, safe transaction
    db.commit()

    return {
        "message": "Schedule synchronized successfully",
        "added": added_count,
        "removed": removed_count,
        "unchanged": len(existing_assignments) - removed_count
    }

@router.post("/auto-generate/{location_id}", status_code=status.HTTP_200_OK)
def run_auto_shift(
        location_id: int,
        start_date: date,
        db: Session = Depends(get_db),
        # Guard: Admins, Managers, and Schedulers can run optimization
        current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Trigger the automated shift scheduling engine for a specific location.
    Restricted to Admin users only.
    """
    # 1. RBAC Check: Ensure user has access to run optimization for this location
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        loc_stmt = select(models.Location.client_id).where(models.Location.id == location_id)
        loc_client_id = db.execute(loc_stmt).scalar_one_or_none()

        if location_id not in allowed_location_ids and loc_client_id not in allowed_client_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to run auto-shift for this location"
            )

    # 2. Call the service layer to handle logic and database operations
    result = generate_weekly_schedule(db, location_id, start_date)
    return result