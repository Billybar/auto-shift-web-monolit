from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import List, Dict

from app.core import models
from app.engine.solver import ShiftOptimizer
from ortools.sat.python import cp_model


def get_next_sunday() -> date:
    """
    Helper: Calculate the date of the upcoming Sunday.
    TODO: In the future, this should be passed as a parameter from the API.
    """
    today = date.today()
    days_ahead = 6 - today.weekday()  # Monday=0 ... Sunday=6
    if days_ahead <= 0:
        days_ahead += 7
    return today + timedelta(days=days_ahead)


def run_optimization_service(db: Session, workplace_id: int):
    """
    Orchestrates the optimization process:
    1. Fetch data from DB
    2. Run Solver
    3. Save results to DB
    """
    # --- 1. Fetch Data ---
    workplace = db.query(models.Workplace).filter(models.Workplace.id == workplace_id).first()
    if not workplace:
        raise ValueError(f"Workplace with ID {workplace_id} not found")

    # Fetch active employees
    employees = db.query(models.Employee).filter(
        models.Employee.workplace_id == workplace_id,
        models.Employee.is_active == True
    ).all()

    if not employees:
        raise ValueError("No active employees found for this workplace")

    # Fetch shifts and weights
    shifts = db.query(models.ShiftDefinition).filter(models.ShiftDefinition.workplace_id == workplace_id).all()
    weights = db.query(models.WorkplaceWeights).filter(models.WorkplaceWeights.workplace_id == workplace_id).first()

    if not weights:
        # Fallback if no weights defined (Optional)
        weights = models.WorkplaceWeights(workplace_id=workplace_id)

        # Fetch Employee Settings (Contracts)
    # Create a dictionary mapping employee_id -> settings object
    settings_list = db.query(models.EmployeeSettings).filter(
        models.EmployeeSettings.employee_id.in_([e.id for e in employees])
    ).all()
    emp_settings_dict = {s.employee_id: s for s in settings_list}

    # --- 2. Run Engine ---
    print(f"Starting optimization for {workplace.name} with {len(employees)} employees...")

    optimizer = ShiftOptimizer(
        workplace_id=workplace_id,
        employees=employees,
        shifts=shifts,
        weights=weights
    )

    status = optimizer.solve(emp_settings_dict)

    # --- 3. Handle Results ---
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        results = optimizer.get_results_as_dicts()
        objective_val = optimizer.solver.ObjectiveValue()

        # Determine the start date for the schedule (Next Sunday)
        start_date = get_next_sunday()

        # Save to DB
        _save_results_to_db(db, results, workplace_id, start_date)

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


def _save_results_to_db(db: Session, results: List[dict], workplace_id: int, start_date: date):
    """
    Clears old assignments for the target week and inserts new ones.
    """
    # 1. Clear existing assignments for this week (Optional: refine filter by date range)
    # For now, we delete ALL future assignments for this workplace to be safe,
    # but in production, you should filter by date range.
    db.query(models.Assignment).filter(
        models.Assignment.workplace_id == workplace_id,
        models.Assignment.date >= start_date
    ).delete()

    # 2. Insert new assignments
    new_assignments = []
    for res in results:
        # Convert relative day index (0-6) to actual date
        assignment_date = start_date + timedelta(days=res["day_index"])

        assignment = models.Assignment(
            workplace_id=workplace_id,
            employee_id=res["employee_id"],
            shift_id=res["shift_id"],
            date=assignment_date
        )
        new_assignments.append(assignment)

    db.add_all(new_assignments)
    db.commit()