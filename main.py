# app/main.py
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from . import models, schemas, crud
from .database import SessionLocal, engine

# Create tables if they don't exist (same as init_db logic)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Auto-Shift API")


# Dependency to get DB session per request
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================
# Manager Endpoints
# ==========================

@app.post("/employees/", response_model=schemas.EmployeeResponse)
def create_employee(employee: schemas.EmployeeCreate, db: Session = Depends(get_db)):
    # Hardcoded workplace_id for now, or fetch from auth later
    return crud.create_employee(db=db, employee=employee, workplace_id=1)


@app.delete("/employees/{employee_id}")
def delete_employee(employee_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_employee(db, employee_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"message": "Employee deleted successfully"}


@app.patch("/weights/{workplace_id}", response_model=schemas.WeightsUpdate)
def update_workplace_weights(workplace_id: int, weights: schemas.WeightsUpdate, db: Session = Depends(get_db)):
    updated = crud.update_weights(db, workplace_id, weights)
    if not updated:
        raise HTTPException(status_code=404, detail="Workplace weights not found")
    return updated


# ==========================
# Logic / Solver Trigger
# ==========================

@app.post("/schedule/generate/{workplace_id}")
def generate_schedule(workplace_id: int, db: Session = Depends(get_db)):
    """
    Triggers the OR-Tools optimizer.
    This replaces the manual execution of 'main.py'.
    """
    from .services.optimizer import run_optimization_service  # Refactored function

    try:
        # Pass the DB session to the optimizer service
        result = run_optimization_service(db, workplace_id)
        if result['status'] == 'OPTIMAL':
            return {"status": "success", "objective_value": result['objective']}
        else:
            raise HTTPException(status_code=400, detail="No solution found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================
# Employee Endpoints
# ==========================

@app.get("/schedule/{workplace_id}")
def get_schedule(workplace_id: int, db: Session = Depends(get_db)):
    # Fetch assignments from DB and return as JSON
    assignments = db.query(models.Assignment).filter(models.Assignment.workplace_id == workplace_id).all()
    return assignments