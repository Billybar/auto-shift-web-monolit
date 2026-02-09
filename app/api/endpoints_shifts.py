from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core import models

# We will implement this service in the next step
# from app.services.optimization_service import run_solver

router = APIRouter()


@router.post("/generate/{workplace_id}")
def generate_schedule(workplace_id: int, db: Session = Depends(get_db)):
    """
    Triggers the shift generation algorithm.
    TODO: Move this to an async task (Celery) in the future to avoid timeouts.
    """
    # 1. Check if workplace exists
    workplace = db.query(models.Workplace).filter(models.Workplace.id == workplace_id).first()
    if not workplace:
        raise HTTPException(status_code=404, detail="Workplace not found")

    try:
        # Placeholder for the actual solver call
        # result = run_solver(db, workplace_id)

        # Temporary response until we connect the solver logic
        return {
            "status": "simulated_success",
            "message": f"Optimization started for workplace {workplace.name}",
            "workplace_id": workplace_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/results/{workplace_id}")
def get_schedule_results(workplace_id: int, db: Session = Depends(get_db)):
    """
    Fetch the generated assignments from the database.
    """
    assignments = db.query(models.Assignment).filter(models.Assignment.workplace_id == workplace_id).all()

    if not assignments:
        return {"message": "No schedule found for this workplace", "assignments": []}

    return assignments