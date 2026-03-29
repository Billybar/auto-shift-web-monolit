from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List

from app.core import models, schemas
from app.core.database import get_db

# for security - only admin can create and delete
from app.api.dependencies import get_current_user, get_current_admin_user

router = APIRouter()
@router.get("/", response_model=List[schemas.ClientResponse])
def read_clients(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve clients.
    Admins see all clients. Managers/Schedulers see only their explicitly assigned clients
    or clients derived from their assigned locations. Regular employees see their own client.
    """
    # Use distinct() to prevent duplicate clients if a user is assigned to multiple locations of the same client
    stmt = select(models.Client).distinct()

    # Apply RBAC Data Filtering for non-admins
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_client_ids = [client.id for client in current_user.clients]
        allowed_location_ids = [loc.id for loc in current_user.locations]

        # Regular employee sees only the client of their assigned location
        if current_user.role == schemas.RoleEnum.EMPLOYEE and current_user.employee_id:
            allowed_location_ids.append(current_user.employee.location_id)

        # Outer join with Location ensures we catch clients explicitly assigned to the user
        # even if those clients don't have any locations yet.
        stmt = stmt.outerjoin(models.Location).where(
            (models.Client.id.in_(allowed_client_ids)) |
            (models.Location.id.in_(allowed_location_ids))
        )

    stmt = stmt.offset(skip).limit(limit)
    return db.execute(stmt).scalars().all()


@router.get("/{client_id}", response_model=schemas.ClientResponse)
def read_client(
        client_id: int,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve a specific client by ID (with RBAC verification to prevent IDOR).
    """
    stmt = select(models.Client).where(models.Client.id == client_id).distinct()

    # Apply RBAC Data Filtering
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_client_ids = [client.id for client in current_user.clients]
        allowed_location_ids = [loc.id for loc in current_user.locations]

        if current_user.role == schemas.RoleEnum.EMPLOYEE and current_user.employee_id:
            allowed_location_ids.append(current_user.employee.location_id)

        stmt = stmt.outerjoin(models.Location).where(
            (models.Client.id.in_(allowed_client_ids)) |
            (models.Location.id.in_(allowed_location_ids))
        )

    client = db.execute(stmt).scalar_one_or_none()

    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found or access denied"
        )
    return client

@router.post("/", response_model=schemas.ClientResponse, status_code=status.HTTP_201_CREATED)
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


@router.put("/{client_id}", response_model=schemas.ClientResponse)
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


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(client_id: int, db: Session = Depends(get_db),
                  current_admin: models.User = Depends(get_current_admin_user)):
    stmt = select(models.Client).where(models.Client.id == client_id)
    db_client = db.execute(stmt).scalar_one_or_none()
    if not db_client:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")

    db.delete(db_client)
    db.commit()
    return None
