from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List

from app.api.access import ensure_location_access
from app.core import models, schemas
from app.core.database import get_db
from app.core.enums import ErrorCode
from app.core.errors import AppError
from app.services import position_service, shift_demand_service

# for security - only admin can create
from app.api.dependencies import (
    get_current_user,
    get_current_admin_user,
    get_current_scheduler_user
)

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
    Retrieve locations.
    Admins see everything. Managers/Schedulers see only their permitted locations.
    """
    stmt = select(models.Location)

    # Apply RBAC Data Filtering for non-admins
    if current_user.role != schemas.RoleEnum.ADMIN:
        # Extract allowed IDs from the current user's M2M relationships
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        # Regular employee sees only their own location
        if current_user.role == schemas.RoleEnum.EMPLOYEE and current_user.employee_id:
            allowed_location_ids.append(current_user.employee.location_id)

        # Filter: Location is directly assigned OR Location's client is assigned
        stmt = stmt.where(
            (models.Location.id.in_(allowed_location_ids)) |
            (models.Location.client_id.in_(allowed_client_ids))
        )

    stmt = stmt.offset(skip).limit(limit)
    locations = db.execute(stmt).scalars().all()
    return locations

@router.get("/{location_id}", response_model=schemas.LocationResponse)
def read_location_by_id(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
        Retrieve a specific location by its ID (with RBAC verification).
        """
    stmt = select(models.Location).where(models.Location.id == location_id)

    # Apply RBAC Data Filtering to prevent IDOR
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        if current_user.role == schemas.RoleEnum.EMPLOYEE and current_user.employee_id:
            allowed_location_ids.append(current_user.employee.location_id)

        stmt = stmt.where(
            (models.Location.id.in_(allowed_location_ids)) |
            (models.Location.client_id.in_(allowed_client_ids))
        )

    location = db.execute(stmt).scalar_one_or_none()

    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found or access denied"
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

    # Create the new location with its default optimization weights (column defaults fill the values)
    # and its default role, so employees and demand have a role from the start
    db_location = models.Location(
        name=location_in.name,
        client_id=location_in.client_id,
        cycle_length=location_in.cycle_length,
        shifts_per_day=location_in.shifts_per_day,
        weights=models.LocationWeights(),
        positions=[position_service.new_default_position()],
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



# -------
# ----- weights Operations ------

@router.put("/{location_id}/weights", response_model=schemas.LocationWeightsResponse)
def update_location_weights(
        location_id: int,
        weights_in: schemas.LocationWeightsUpdate,
        db: Session = Depends(get_db),
        # Guard: Admins, Managers, and Schedulers can configure optimization weights
        current_user: models.User = Depends(get_current_scheduler_user)
):
    """
        Update the optimization weights for a specific location.
        Performs an 'Upsert': Updates if exists, creates if it doesn't.
        """
    # 1. RBAC Verification
    loc_stmt = select(models.Location).where(models.Location.id == location_id)
    loc = db.execute(loc_stmt).scalar_one_or_none()

    if current_user.role == schemas.RoleEnum.ADMIN:
        if not loc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Location not found or access denied"
            )
    else:
        allowed_location_ids = [user_loc.id for user_loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        # Verify location access before doing anything
        if not loc or (loc.id not in allowed_location_ids and loc.client_id not in allowed_client_ids):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to update weights for this location"
            )

    # 2. Check if weights already exist for this location
    stmt_weights = select(models.LocationWeights).where(
        models.LocationWeights.location_id == location_id
    )
    weights = db.execute(stmt_weights).scalars().first()

    if weights:
        # Only the fields sent are updated, so a partial PUT does not reset the rest to defaults
        update_data = weights_in.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(weights, key, value)
    else:
        weights = models.LocationWeights(
            location_id=location_id,
            **weights_in.model_dump()
        )
        db.add(weights)

    #. commit and refresh
    db.commit()
    db.refresh(weights)
    return weights


@router.get("/{location_id}/weights", response_model=schemas.LocationWeightsResponse)
def get_location_weights(
        location_id: int,
        db: Session = Depends(get_db),
        # Guard: Anyone who can view the location can view its weights
        current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve the optimization weights for a specific location.
    Used to populate the UI form on initial load.
    """
    # 1. RBAC Verification
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        loc_stmt = select(models.Location).where(models.Location.id == location_id)
        loc = db.execute(loc_stmt).scalar_one_or_none()

        if not loc or (loc.id not in allowed_location_ids and loc.client_id not in allowed_client_ids):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Weights not found or access denied"
            )

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


# -------
# ----- Weekly demand template ------
# Under /locations because /shift-definitions/demand-template would be captured by PUT /shift-definitions/{shift_id}

def _template_response(db: Session, location_id: int) -> schemas.DemandTemplateResponse:
    rows = shift_demand_service.get_template(db, location_id)
    return schemas.DemandTemplateResponse(
        location_id=location_id,
        cells=[
            schemas.DemandTemplateCell(
                shift_id=row.shift_definition_id,
                position_id=row.position_id,
                day_of_week=row.day_of_week,
                required_employees=row.required_employees,
            )
            for row in rows
        ],
    )


@router.get("/{location_id}/demand-template", response_model=schemas.DemandTemplateResponse)
def get_demand_template(
        location_id: int,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    """The weekly template: how many people each shift needs per role and weekday (cells above 0)."""
    ensure_location_access(db, current_user, location_id, allow_own_employee_location=True)
    return _template_response(db, location_id)


@router.put("/{location_id}/demand-template", response_model=schemas.DemandTemplateResponse)
def replace_demand_template(
        location_id: int,
        template_in: schemas.DemandTemplateUpdate,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Replace the weekly template with the desired state sent. Cells of active roles that are left
    out (or 0) are cleared; archived roles keep their template. Date overrides are not touched.
    """
    ensure_location_access(db, current_user, location_id)

    keys = [(c.shift_id, c.day_of_week, c.position_id) for c in template_in.cells]
    if len(keys) != len(set(keys)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The same shift, day and role appears twice",
        )

    shift_ids = set(db.execute(
        select(models.ShiftDefinition.id).where(models.ShiftDefinition.location_id == location_id)
    ).scalars().all())
    unknown_shifts = sorted({c.shift_id for c in template_in.cells} - shift_ids)
    if unknown_shifts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Shifts not found in this location: {unknown_shifts}",
        )

    active_position_ids = {p.id for p in position_service.get_active_positions(db, location_id)}
    invalid_positions = sorted({c.position_id for c in template_in.cells} - active_position_ids)
    if invalid_positions:
        raise AppError(
            ErrorCode.POSITION_INVALID,
            "Template cells must use active roles of this location",
            status_code=status.HTTP_400_BAD_REQUEST,
            params={"position_ids": invalid_positions},
        )

    shift_demand_service.replace_template(
        db, location_id, [(c.shift_id, c.day_of_week, c.position_id, c.required_employees) for c in template_in.cells]
    )
    db.commit()
    return _template_response(db, location_id)
