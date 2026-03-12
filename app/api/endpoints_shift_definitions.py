from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from typing import List

from app.core import models, schemas
from app.core.database import get_db

router = APIRouter()


# ==========================================
# Shift Definitions CRUD Operations
# ==========================================

@router.get("/", response_model=List[schemas.ShiftDefinitionResponse])
def read_shift_definitions(location_id: int, db: Session = Depends(get_db)):
    """
    Retrieve all shift definitions for a specific location.
    """
    stmt = select(models.ShiftDefinition).where(
        models.ShiftDefinition.location_id == location_id
    )
    shifts = db.execute(stmt).scalars().all()

    return shifts


@router.post("/", response_model=schemas.ShiftDefinitionResponse, status_code=status.HTTP_201_CREATED)
def create_shift_definition(
        shift_in: schemas.ShiftDefinitionCreate,
        db: Session = Depends(get_db)
):
    """
    Create a new shift definition (e.g., Morning, Evening) for a location.
    """
    # Create the new model instance using Pydantic's model_dump (v2) or dict() (v1)
    new_shift = models.ShiftDefinition(**shift_in.dict())

    db.add(new_shift)
    db.commit()
    db.refresh(new_shift)

    return new_shift


@router.put("/{shift_id}", response_model=schemas.ShiftDefinitionResponse)
def update_shift_definition(
        shift_id: int,
        shift_in: schemas.ShiftDefinitionUpdate,
        db: Session = Depends(get_db)
):
    """
    Update an existing shift definition (e.g., changing its start/end time).
    """
    stmt = select(models.ShiftDefinition).where(models.ShiftDefinition.id == shift_id)
    shift = db.execute(stmt).scalars().first()

    if not shift:
        raise HTTPException(status_code=404, detail="Shift definition not found")

    # Update only the fields that were explicitly set in the request
    update_data = shift_in.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(shift, key, value)

    db.commit()
    db.refresh(shift)

    return shift


@router.delete("/{shift_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shift_definition(shift_id: int, db: Session = Depends(get_db)):
    """
    Delete a shift definition.
    Note: Cascading deletes for related demands should be handled at the DB level.
    """
    stmt = select(models.ShiftDefinition).where(models.ShiftDefinition.id == shift_id)
    shift = db.execute(stmt).scalars().first()

    if not shift:
        raise HTTPException(status_code=404, detail="Shift definition not found")

    db.delete(shift)
    db.commit()

    return None


# ==========================================
# Shift Demands (Daily Required Employees)
# ==========================================

@router.get("/{shift_id}/demands", response_model=List[schemas.ShiftDemandResponse])
def get_shift_demands(shift_id: int, db: Session = Depends(get_db)):
    """
    Retrieve the 7-day employee requirements (demands) for a specific shift.
    """
    # 1. Verify the shift definition exists
    stmt_shift = select(models.ShiftDefinition).where(models.ShiftDefinition.id == shift_id)
    shift = db.execute(stmt_shift).scalars().first()

    if not shift:
        raise HTTPException(status_code=404, detail="Shift definition not found")

    # 2. Fetch demands ordered by day of the week (0=Sunday, 6=Saturday)
    stmt_demands = select(models.ShiftDemand).where(
        models.ShiftDemand.shift_definition_id == shift_id
    ).order_by(models.ShiftDemand.day_of_week)

    demands = db.execute(stmt_demands).scalars().all()

    return demands


@router.put("/{shift_id}/demands", status_code=status.HTTP_200_OK)
def update_shift_demands(
        shift_id: int,
        payload: schemas.ShiftDemandUpdate,
        db: Session = Depends(get_db)
):
    """
    Smart Sync update for shift demands.
    Receives an array of demands (typically 7 days) and replaces the existing ones atomically.
    """
    # 1. Verify the shift definition exists
    stmt_shift = select(models.ShiftDefinition).where(models.ShiftDefinition.id == shift_id)
    shift = db.execute(stmt_shift).scalars().first()

    if not shift:
        raise HTTPException(status_code=404, detail="Shift definition not found")

    # 2. Validate that we don't have duplicate days in the incoming payload
    provided_days = [d.day_of_week for d in payload.demands]
    if len(provided_days) != len(set(provided_days)):
        raise HTTPException(status_code=400, detail="Duplicate days found in payload")

    # 3. Bulk Delete existing demands for this shift using SQLAlchemy 2.0 syntax
    stmt_delete = delete(models.ShiftDemand).where(
        models.ShiftDemand.shift_definition_id == shift_id
    )
    db.execute(stmt_delete)

    # 4. Insert the new demands
    new_demands = []
    for demand_in in payload.demands:
        new_demand = models.ShiftDemand(
            shift_definition_id=shift_id,
            day_of_week=demand_in.day_of_week,
            required_employees=demand_in.required_employees
        )
        new_demands.append(new_demand)

    db.add_all(new_demands)

    # 5. Commit the transaction safely (both delete and insert happen atomically)
    db.commit()

    return {
        "message": "Shift demands updated successfully",
        "updated_count": len(new_demands)
    }