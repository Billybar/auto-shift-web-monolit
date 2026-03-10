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
from datetime import date

from app.core import models, schemas
from app.core.database import get_db

# Security Dependencies
from app.api.dependencies import get_current_user, get_current_admin_user
from app.services.weekly_schedule_service import generate_weekly_schedule

router = APIRouter()


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
    Accessible to all authenticated users (employees and admins).
    """
    stmt = select(models.Assignment).where(
        models.Assignment.location_id == location_id,
        models.Assignment.date >= start_date,
        models.Assignment.date <= end_date
    )

    # Optional filter to fetch assignments for a specific employee
    if employee_id:
        stmt = stmt.where(models.Assignment.employee_id == employee_id)

    assignments = db.execute(stmt).scalars().all()
    return assignments


@router.post("/", status_code=status.HTTP_200_OK)
def sync_weekly_assignments(
        location_id: int,
        start_date: date,
        end_date: date,
        assignments_in: List[schemas.AssignmentCreate],
        db: Session = Depends(get_db),
        current_admin: models.User = Depends(get_current_admin_user)
):
    """
    Smart synchronization of the weekly schedule.
    Adds new shifts, removes deleted shifts, and keeps existing shifts intact
    to preserve their original database IDs.
    Restricted to Admin users only.
    """

    # 1. Fetch all existing assignments within the specified date range
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

    # 2. Identify and insert new assignments that don't exist in the DB
    for a in assignments_in:
        key = (a.employee_id, a.shift_id, a.date)
        incoming_keys.add(key)

        if key not in existing_map:
            # This is a completely new shift added by the frontend
            new_db_assignment = models.Assignment(
                location_id=location_id,
                employee_id=a.employee_id,
                shift_id=a.shift_id,
                date=a.date
            )
            db.add(new_db_assignment)
            added_count += 1

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
        current_admin: models.User = Depends(get_current_admin_user)
):
    """
    Trigger the automated shift scheduling engine for a specific location.
    Restricted to Admin users only.
    """
    # Call the service layer to handle logic and database operations
    result = generate_weekly_schedule(db, location_id, start_date)
    return result