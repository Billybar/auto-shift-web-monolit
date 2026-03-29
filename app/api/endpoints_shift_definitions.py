from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from typing import List, Optional

from app.core import models, schemas
from app.core.database import get_db
from app.api.dependencies import get_current_user, get_current_scheduler_user

router = APIRouter()

def _verify_location_access(db: Session, current_user: models.User, location_id: int, read_only: bool = False):
    """
    Helper function to verify if the user has RBAC access to a specific location.
    DRY approach to prevent repeating the same security check in 6 different endpoints.
    """
    if current_user.role == schemas.RoleEnum.ADMIN:
        return

    allowed_location_ids = [loc.id for loc in current_user.locations]
    allowed_client_ids = [client.id for client in current_user.clients]

    # Regular employees can view (read_only) data for their own location
    if read_only and current_user.role == schemas.RoleEnum.EMPLOYEE and current_user.employee_id:
        allowed_location_ids.append(current_user.employee.location_id)

    loc_stmt = select(models.Location.client_id).where(models.Location.id == location_id)
    loc_client_id = db.execute(loc_stmt).scalar_one_or_none()

    if location_id not in allowed_location_ids and loc_client_id not in allowed_client_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access shift data for this location"
        )


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
    _verify_location_access(db, current_user, location_id, read_only=True)

    stmt = select(models.ShiftDefinition).where(
        models.ShiftDefinition.location_id == location_id
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
    _verify_location_access(db, current_user, shift_in.location_id)

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
    _verify_location_access(db, current_user, shift.location_id)

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

    _verify_location_access(db, current_user, shift.location_id)

    db.delete(shift)
    db.commit()

    return None

# ==========================================
# Shift Demands (Daily Required Employees)
# ==========================================
# ==========================================
# Shift Demands (Daily Required Employees)
# ==========================================

@router.get("/{shift_id}/demands", response_model=List[schemas.ShiftDemandResponse])
def get_shift_demands(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user) # GUARD ADDED
):
    """
    Retrieve the 7-day employee requirements (demands) for a specific shift.
    """
    stmt_shift = select(models.ShiftDefinition).where(models.ShiftDefinition.id == shift_id)
    shift = db.execute(stmt_shift).scalars().first()

    if not shift:
        raise HTTPException(status_code=404, detail="Shift definition not found")

    # Verify access
    _verify_location_access(db, current_user, shift.location_id, read_only=True)

    stmt_demands = select(models.ShiftDemand).where(
        models.ShiftDemand.shift_definition_id == shift_id
    ).order_by(models.ShiftDemand.day_of_week)

    return db.execute(stmt_demands).scalars().all()


@router.put("/{shift_id}/demands", status_code=status.HTTP_200_OK)
def update_shift_demands(
        shift_id: int,
        payload: schemas.ShiftDemandUpdate,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_scheduler_user) # GUARD ADDED
):
    """
    Smart Sync update for shift demands.
    """
    stmt_shift = select(models.ShiftDefinition).where(models.ShiftDefinition.id == shift_id)
    shift = db.execute(stmt_shift).scalars().first()

    if not shift:
        raise HTTPException(status_code=404, detail="Shift definition not found")

    # Verify access
    _verify_location_access(db, current_user, shift.location_id)

    provided_days = [d.day_of_week for d in payload.demands]
    if len(provided_days) != len(set(provided_days)):
        raise HTTPException(status_code=400, detail="Duplicate days found in payload")

    # Bulk Delete existing demands
    stmt_delete = delete(models.ShiftDemand).where(
        models.ShiftDemand.shift_definition_id == shift_id
    )
    db.execute(stmt_delete)

    # Insert new demands
    new_demands = [
        models.ShiftDemand(
            shift_definition_id=shift_id,
            day_of_week=demand_in.day_of_week,
            required_employees=demand_in.required_employees
        )
        for demand_in in payload.demands
    ]

    db.add_all(new_demands)
    db.commit()

    return {
        "message": "Shift demands updated successfully",
        "updated_count": len(new_demands)
    }