from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List

from app.core import models, schemas
from app.core.database import get_db

# for security - only admin can create and delete
from app.api.dependencies import get_current_user, get_current_admin_user

router = APIRouter()
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
