from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List

from app.core import models, schemas
from app.core.database import get_db

# for security - only admin can create
from app.api.dependencies import get_current_user, get_current_admin_user

router = APIRouter()


# ==========================================
# 1. ORGANIZATIONS
# ==========================================

@router.get("/organizations/", response_model=List[schemas.OrganizationResponse])
def read_organizations(skip: int = 0, limit: int = 100, db: Session = Depends(get_db),
                       current_user: models.User = Depends(get_current_user)):
    stmt = select(models.Organization).offset(skip).limit(limit)
    return db.execute(stmt).scalars().all()


@router.get("/organizations/{org_id}", response_model=schemas.OrganizationResponse)
def read_organization(org_id: int, db: Session = Depends(get_db),
                      current_user: models.User = Depends(get_current_user)):
    stmt = select(models.Organization).where(models.Organization.id == org_id)
    org = db.execute(stmt).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


@router.post("/organizations/", response_model=schemas.OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_organization(org_in: schemas.OrganizationCreate, db: Session = Depends(get_db),
                        current_admin: models.User = Depends(get_current_admin_user)):
    # Validate uniqueness of organization name (Optional but recommended)
    existing_stmt = select(models.Organization).where(models.Organization.name == org_in.name)
    if db.execute(existing_stmt).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Organization with this name already exists")

    db_org = models.Organization(name=org_in.name)
    db.add(db_org)
    db.commit()
    db.refresh(db_org)
    return db_org


@router.put("/organizations/{org_id}", response_model=schemas.OrganizationResponse)
def update_organization(org_id: int, org_update: schemas.OrganizationCreate, db: Session = Depends(get_db),
                        current_admin: models.User = Depends(get_current_admin_user)):
    stmt = select(models.Organization).where(models.Organization.id == org_id)
    db_org = db.execute(stmt).scalar_one_or_none()
    if not db_org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    db_org.name = org_update.name
    db.commit()
    db.refresh(db_org)
    return db_org


@router.delete("/organizations/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organization(org_id: int, db: Session = Depends(get_db),
                        current_admin: models.User = Depends(get_current_admin_user)):
    stmt = select(models.Organization).where(models.Organization.id == org_id)
    db_org = db.execute(stmt).scalar_one_or_none()
    if not db_org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    db.delete(db_org)
    db.commit()
    return None


# ==========================================
# 2. CLIENTS
# ==========================================

@router.get("/clients/", response_model=List[schemas.ClientResponse])
def read_clients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db),
                 current_user: models.User = Depends(get_current_user)):
    stmt = select(models.Client).offset(skip).limit(limit)
    return db.execute(stmt).scalars().all()


@router.get("/clients/{client_id}", response_model=schemas.ClientResponse)
def read_client(client_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    stmt = select(models.Client).where(models.Client.id == client_id)
    client = db.execute(stmt).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
    return client


@router.post("/clients/", response_model=schemas.ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(client_in: schemas.ClientCreate, db: Session = Depends(get_db),
                  current_admin: models.User = Depends(get_current_admin_user)):
    # Verify Parent Organization exists
    org_stmt = select(models.Organization).where(models.Organization.id == client_in.organization_id)
    if not db.execute(org_stmt).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization not found")

    db_client = models.Client(name=client_in.name, organization_id=client_in.organization_id)
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client


@router.put("/clients/{client_id}", response_model=schemas.ClientResponse)
def update_client(client_id: int, client_update: schemas.ClientCreate, db: Session = Depends(get_db),
                  current_admin: models.User = Depends(get_current_admin_user)):
    stmt = select(models.Client).where(models.Client.id == client_id)
    db_client = db.execute(stmt).scalar_one_or_none()
    if not db_client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    # Verify new Parent Organization exists
    org_stmt = select(models.Organization).where(models.Organization.id == client_update.organization_id)
    if not db.execute(org_stmt).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization not found")

    db_client.name = client_update.name
    db_client.organization_id = client_update.organization_id
    db.commit()
    db.refresh(db_client)
    return db_client


@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, db: Session = Depends(get_db),
                  current_admin: models.User = Depends(get_current_admin_user)):
    stmt = select(models.Client).where(models.Client.id == client_id)
    db_client = db.execute(stmt).scalar_one_or_none()
    if not db_client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    db.delete(db_client)
    db.commit()
    return None


# ==========================================
# 3. LOCATIONS
# ==========================================


# -------
# ---- Read Operations (Allowed for all authenticated users) -----

@router.get("/locations/", response_model=List[schemas.LocationResponse])
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

@router.get("/locations/{location_id}", response_model=schemas.LocationResponse)
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

@router.post("/locations/", response_model=schemas.LocationResponse, status_code=status.HTTP_201_CREATED)
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


@router.put("/locations/{location_id}", response_model=schemas.LocationResponse)
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


@router.delete("/locations/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
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