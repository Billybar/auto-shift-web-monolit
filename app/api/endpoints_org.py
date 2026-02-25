from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.core import models, schemas
from app.core.database import get_db

router = APIRouter()

@router.get("/locations/", response_model=List[schemas.LocationResponse])
def read_locations(db: Session = Depends(get_db)):
    """
    Retrieve all available locations (sites) in the system.
    """
    locations = db.query(models.Location).all()
    return locations

# @router.post("/locations/", re)