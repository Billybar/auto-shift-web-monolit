from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.api.access import ensure_location_access
from app.core import models, schemas
from app.core.database import get_db
from app.core.enums import ErrorCode
from app.core.errors import AppError
from app.api.dependencies import get_current_user, get_current_scheduler_user
from app.services import shift_demand_service

router = APIRouter()

# ==========================================
# Shift Definitions CRUD Operations
# ==========================================

@router.get("/", response_model=List[schemas.ShiftDefinitionResponse])
def read_shift_definitions(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user) # GUARD ADDED
):
    """
    Retrieve all shift definitions for a specific location.
    """
    ensure_location_access(db, current_user, location_id, allow_own_employee_location=True)

    stmt = (
        select(models.ShiftDefinition)
        .where(models.ShiftDefinition.location_id == location_id)
        .order_by(models.ShiftDefinition.start_time.asc())
    )
    return db.execute(stmt).scalars().all()


@router.post("/", response_model=schemas.ShiftDefinitionResponse, status_code=status.HTTP_201_CREATED)
def create_shift_definition(
        shift_in: schemas.ShiftDefinitionCreate,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_scheduler_user) # GUARD ADDED
):
    """
    Create a new shift definition (e.g., Morning, Evening) for a location.
    """
    ensure_location_access(db, current_user, shift_in.location_id)

    # Use model_dump() for Pydantic V2
    new_shift = models.ShiftDefinition(**shift_in.model_dump())

    db.add(new_shift)
    db.commit()
    db.refresh(new_shift)

    return new_shift


@router.put("/{shift_id}", response_model=schemas.ShiftDefinitionResponse)
def update_shift_definition(
        shift_id: int,
        shift_in: schemas.ShiftDefinitionUpdate,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_scheduler_user) # GUARD ADDED
):
    """
    Update an existing shift definition.
    """
    stmt = select(models.ShiftDefinition).where(models.ShiftDefinition.id == shift_id)
    shift: Optional[models.ShiftDefinition] = db.execute(stmt).scalar_one_or_none()

    if not shift:
        raise HTTPException(status_code=404, detail="Shift definition not found")

    # Verify access to the location this shift belongs to
    ensure_location_access(db, current_user, shift.location_id)

    # Update using model_dump
    update_data = shift_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(shift, key, value)

    db.commit()
    db.refresh(shift)

    return shift


@router.delete("/{shift_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shift_definition(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_scheduler_user) # GUARD ADDED
):
    """
    Delete a shift definition.
    """
    stmt = select(models.ShiftDefinition).where(models.ShiftDefinition.id == shift_id)
    shift = db.execute(stmt).scalar_one_or_none()

    if not shift:
        raise HTTPException(status_code=404, detail="Shift definition not found")

    ensure_location_access(db, current_user, shift.location_id)

    db.delete(shift)
    db.commit()

    return None

# ==========================================
# Shift Demands (required employees per role)
# ==========================================
# The weekly template is edited under /api/locations/{location_id}/demand-template

@router.get("/weekly-demand", response_model=List[schemas.ShiftDayDemandResponse])
def get_weekly_demand(
    location_id: int,
    start_date: date,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    The effective demand of the 7 days from start_date (template + overrides), one cell per
    shift × active role × date, including cells of 0.
    """
    ensure_location_access(db, current_user, location_id, allow_own_employee_location=True)

    demand_map = shift_demand_service.resolve_demand(db, location_id, start_date, start_date + timedelta(days=6))

    return [
        schemas.ShiftDayDemandResponse(
            shift_id=s_id,
            position_id=p_id,
            date=d,
            required_employees=cell.required,
            is_override=cell.is_override
        )
        for (s_id, d, p_id), cell in demand_map.items()
    ]

# specific date demand override
@router.put("/{shift_id}/demand-overrides/{on_date}", response_model=schemas.ShiftDayDemandResponse)
def update_demand_override(
    shift_id: int,
    on_date: date,
    payload: schemas.ShiftDemandOverrideSet,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_scheduler_user)
):
    """Set one role's demand for a shift on a date; the template's value resets the override."""
    shift = db.execute(select(models.ShiftDefinition).where(models.ShiftDefinition.id == shift_id)).scalars().first()

    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift definition not found")

    ensure_location_access(db, current_user, shift.location_id)

    position = db.execute(select(models.Position).where(
        models.Position.id == payload.position_id,
        models.Position.location_id == shift.location_id,
        models.Position.is_active.is_(True),
    )).scalar_one_or_none()
    if not position:
        raise AppError(
            ErrorCode.POSITION_INVALID,
            "The role must be an active role of the shift's location",
            status_code=status.HTTP_400_BAD_REQUEST,
            params={"position_ids": [payload.position_id]},
        )

    cell = shift_demand_service.set_demand_override(
        db=db,
        shift=shift,
        position_id=position.id,
        on_date=on_date,
        required_employees=payload.required_employees
    )
    db.commit()

    return schemas.ShiftDayDemandResponse(
        shift_id=shift_id,
        position_id=position.id,
        date=on_date,
        required_employees=cell.required,
        is_override=cell.is_override
    )
