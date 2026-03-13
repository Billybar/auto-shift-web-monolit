from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List

from app.core import models, schemas
from app.core.database import get_db
from app.crud import update_weights

# for security - only admin can create
from app.api.dependencies import get_current_user, get_current_admin_user

router = APIRouter()

# -------
# ---- Read Operations (Allowed for all authenticated users) -----

@router.get("/", response_model=List[schemas.LocationResponse])
def read_locations(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve all available locations (sites) in the system.
    Requires the user to be authenticated.
    """
    stmt = select(models.Location).offset(skip).limit(limit)
    locations = db.execute(stmt).scalars().all()
    return locations

@router.get("/{location_id}", response_model=schemas.LocationResponse)
def read_location_by_id(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve a specific location by its ID.
    """
    stmt = select(models.Location).where(models.Location.id == location_id)
    location = db.execute(stmt).scalar_one_or_none()

    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found"
        )
    return location


# -------
# ----- Write Operations (Restricted to Admins ONLY) ------

@router.post("/", response_model=schemas.LocationResponse, status_code=status.HTTP_201_CREATED)
def create_location(
        location_in: schemas.LocationCreate,
        db: Session = Depends(get_db),
        current_admin: models.User = Depends(get_current_admin_user)
):
    """
    Create a new location.
    Only accessible by Admin users.
    """
    # Verify that the parent Client exists before creating the location
    client_stmt = select(models.Client).where(models.Client.id == location_in.client_id)
    client = db.execute(client_stmt).scalar_one_or_none()

    if not client:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Client not found. Cannot create location."
        )

    # Create the new location
    db_location = models.Location(
        name=location_in.name,
        client_id=location_in.client_id,
        cycle_length=location_in.cycle_length,
        shifts_per_day=location_in.shifts_per_day
    )

    db.add(db_location)
    db.commit()
    db.refresh(db_location)

    return db_location


@router.put("/{location_id}", response_model=schemas.LocationResponse)
def update_location(
        location_id: int,
        location_update: schemas.LocationCreate,
        db: Session = Depends(get_db),
        current_admin: models.User = Depends(get_current_admin_user)
):
    """
    Update an existing location's details.
    Only accessible by Admin users.
    """
    stmt = select(models.Location).where(models.Location.id == location_id)
    db_location = db.execute(stmt).scalar_one_or_none()

    if not db_location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found"
        )

    # Verify new Parent Client exists
    client_stmt = select(models.Client).where(models.Client.id == location_update.client_id)
    if not db.execute(client_stmt).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Client not found")

    # Update fields
    db_location.name = location_update.name
    db_location.client_id = location_update.client_id
    db_location.cycle_length = location_update.cycle_length
    db_location.shifts_per_day = location_update.shifts_per_day

    db.commit()
    db.refresh(db_location)

    return db_location


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(
        location_id: int,
        db: Session = Depends(get_db),
        current_admin: models.User = Depends(get_current_admin_user)
):
    """
    Delete a location.
    Only accessible by Admin users.
    """
    stmt = select(models.Location).where(models.Location.id == location_id)
    db_location = db.execute(stmt).scalar_one_or_none()

    if not db_location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found"
        )

    # NOTE: Depending on your DB constraints (CASCADE), deleting a location
    # might fail if it has related employees or shifts.
    # For a production app, consider "soft delete" (is_active=False)
    # or handle the constraints gracefully.
    db.delete(db_location)
    db.commit()

    return None


@router.put("/{location_id}/weights", response_model=schemas.LocationWeightsResponse)
def update_location_weights(
        location_id: int,
        weights_in: schemas.LocationWeightsUpdate,
        db: Session = Depends(get_db)
):
    """
    Update the optimization weights for a specific location.
    Performs an 'Upsert': Updates if exists, creates if it doesn't.
    """
    # 1. Verify the location actually exists
    stmt_location = select(models.Location).where(models.Location.id == location_id)
    location = db.execute(stmt_location).scalars().first()

    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    # 2. Check if weights already exist for this location
    stmt_weights = select(models.LocationWeights).where(
        models.LocationWeights.location_id == location_id
    )
    weights = db.execute(stmt_weights).scalars().first()

    if weights:
        # Update existing weights
        # model_dump() is Pydantic V2 syntax (use dict() if using V1)
        update_data = weights_in.model_dump()
        for key, value in update_data.items():
            setattr(weights, key, value)
    else:
        # Create new weights record if missing
        weights = models.LocationWeights(
            location_id=location_id,
            **weights_in.model_dump()
        )
        db.add(weights)

    # 3. Commit and refresh
    db.commit()
    db.refresh(weights)

    return weights


@router.get("/{location_id}/weights", response_model=schemas.LocationWeightsResponse)
def get_location_weights(location_id: int, db: Session = Depends(get_db)):
    """
    Retrieve the optimization weights for a specific location.
    Used to populate the UI form on initial load.
    """
    stmt_weights = select(models.LocationWeights).where(
        models.LocationWeights.location_id == location_id
    )
    weights = db.execute(stmt_weights).scalars().first()

    if not weights:
        # If no weights exist yet, return a default initialized object
        # so the frontend form doesn't crash on null.
        return schemas.LocationWeightsResponse(
            id=0,
            location_id=location_id,
            **schemas.LocationWeightsBase().model_dump()
        )

    return weights


