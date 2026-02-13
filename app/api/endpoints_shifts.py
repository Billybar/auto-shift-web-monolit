from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core import models, schemas
from app.core.database import get_db

router = APIRouter()


@router.get("/definitions/", response_model=List[schemas.ShiftDefinitionResponse])
def read_shift_definitions(location_id: int, db: Session = Depends(get_db)):
    """
    Retrieve all shift definitions (types) for a specific location.
    Example: Morning, Evening, Night.
    """
    shifts = db.query(models.ShiftDefinition).filter(
        models.ShiftDefinition.location_id == location_id
    ).all()

    if not shifts:
        raise HTTPException(status_code=404, detail="No shifts found for this location")

    return shifts


@router.get("/demands/", response_model=List[schemas.ShiftDemandResponse])
def read_shift_demands(shift_definition_id: int, db: Session = Depends(get_db)):
    """
    Retrieve specific daily demands for a shift type.
    Example: Fetching special staffing requirements for Friday.
    """
    demands = db.query(models.ShiftDemand).filter(
        models.ShiftDemand.shift_definition_id == shift_definition_id
    ).all()

    return demands