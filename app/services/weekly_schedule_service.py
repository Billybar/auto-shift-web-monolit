from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import List, Dict

from app.core import models
from app.engine.solver import ShiftOptimizer
from ortools.sat.python import cp_model


def get_next_sunday() -> date:
    today = date.today()
    days_ahead = 6 - today.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return today + timedelta(days=days_ahead)


def generate_weekly_schedule(db: Session, location_id: int):
    """
    Orchestrates the schedule process:
    1. Fetch data from DB
    2. Run Solver
    3. Save results to DB
    """
    # --- 1. Fetch Data ---
    location = db.query(models.Location).filter(models.Location.id == location_id).first()
    if not location:
        raise ValueError(f"Location with ID {location_id} not found")

    # Fetch active employees
    employees = db.query(models.Employee).filter(
        models.Employee.location_id == location_id,
        models.Employee.is_active == True
    ).all()

    if not employees:
        raise ValueError("No active employees found for this location")

    # Fetch shifts and weights (Assuming your models are updated to location_id)
    shifts = db.query(models.ShiftDefinition).filter(models.ShiftDefinition.location_id == location_id).all()

    # If your weights model is LocationWeights, change LocationWeights to LocationWeights below:
    weights = db.query(models.LocationWeights).filter(models.LocationWeights.location_id == location_id).first()
    if not weights:
        weights = models.LocationWeights(location_id=location_id)

    # Fetch Employee Settings
    settings_list = db.query(models.EmployeeSettings).filter(
        models.EmployeeSettings.employee_id.in_([e.id for e in employees])
    ).all()
    emp_settings_dict = {s.employee_id: s for s in settings_list}

    # --- 2. Run Engine ---
    print(f"Starting optimization for {location.name} with {len(employees)} employees...")

    optimizer = ShiftOptimizer(
        location_id=location_id,  # שינינו כאן ל-location_id
        employees=employees,
        shifts=shifts,
        weights=weights
    )

    status = optimizer.solve(emp_settings_dict)

    # --- 3. Handle Results ---
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        results = optimizer.get_results_as_dicts()
        objective_val = optimizer.solver.ObjectiveValue()

        start_date = get_next_sunday()

        # Save to DB - מעבירים את ה-location_id
        _save_results_to_db(db, results, location_id, start_date)

        return {
            "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
            "objective": objective_val,
            "assignments_count": len(results)
        }
    else:
        return {
            "status": "FAILED",
            "objective": None,
            "assignments_count": 0
        }


def _save_results_to_db(db: Session, results: List[dict], location_id: int, start_date: date):


    db.query(models.Assignment).filter(
        models.Assignment.location_id == location_id,
        models.Assignment.date >= start_date
    ).delete()

    new_assignments = []
    for res in results:
        assignment_date = start_date + timedelta(days=res["day_index"])

        assignment = models.Assignment(
            location_id=location_id,
            employee_id=res["employee_id"],
            shift_id=res["shift_id"],
            date=assignment_date
        )
        new_assignments.append(assignment)

    db.add_all(new_assignments)
    db.commit()