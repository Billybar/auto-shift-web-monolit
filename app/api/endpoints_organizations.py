from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List

from app.core import models, schemas
from app.core.database import get_db
from app.api.access import AccessScope

# for security - only admin can create
from app.api.dependencies import get_current_user, get_current_admin_user

router = APIRouter()

@router.get("/", response_model=List[schemas.OrganizationResponse])
def read_organizations(skip: int = 0, limit: int = 100, db: Session = Depends(get_db),
                       current_user: models.User = Depends(get_current_user)):
    """
    Retrieve organizations, oldest first.
    Admins see all of them; anyone else sees only the organizations of the clients in their scope.
    """
    scope = AccessScope.of(current_user, include_own_location=True)
    stmt = (
        select(models.Organization)
        .where(scope.organization_filter())
        .order_by(models.Organization.id)
        .offset(skip)
        .limit(limit)
    )
    return db.execute(stmt).scalars().all()


@router.get("/{org_id}", response_model=schemas.OrganizationResponse)
def read_organization(org_id: int, db: Session = Depends(get_db),
                      current_user: models.User = Depends(get_current_user)):
    """Retrieve one organization; 404 when it doesn't exist or is out of the user's scope (IDOR)."""
    scope = AccessScope.of(current_user, include_own_location=True)
    stmt = select(models.Organization).where(models.Organization.id == org_id, scope.organization_filter())
    org = db.execute(stmt).scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found or access denied")
    return org


@router.post("/", response_model=schemas.OrganizationResponse, status_code=status.HTTP_201_CREATED)
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


@router.put("/{org_id}", response_model=schemas.OrganizationResponse)
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


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organization(org_id: int, db: Session = Depends(get_db),
                        current_admin: models.User = Depends(get_current_admin_user)):
    stmt = select(models.Organization).where(models.Organization.id == org_id)
    db_org = db.execute(stmt).scalar_one_or_none()
    if not db_org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    db.delete(db_org)
    db.commit()
    return None




