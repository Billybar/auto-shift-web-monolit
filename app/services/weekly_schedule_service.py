from sqlalchemy.orm import Session
from sqlalchemy import select, delete
from datetime import date, timedelta
from typing import List, Dict

from app.core import models
from app.engine.solver import ShiftOptimizer
from ortools.sat.python import cp_model


def generate_weekly_schedule(db: Session, location_id: int, start_date: date):
    """
    Orchestrates the schedule process:
    1. Fetch data from DB
    2. Run Solver
    3. Save results to DB
    """
    # --- 1. Fetch Data ---
    stmt_loc = select(models.Location).where(models.Location.id == location_id)
    location = db.execute(stmt_loc).scalar_one_or_none()
    if not location:
        raise ValueError(f"Location with ID {location_id} not found")

    # Fetch active employees
    stmt_emp = select(models.Employee).where(
        models.Employee.location_id == location_id,
        models.Employee.is_active == True
    )
    employees = db.execute(stmt_emp).scalars().all()
    if not employees:
        raise ValueError("No active employees found for this location")

    # Fetch shifts
    stmt_shifts = select(models.ShiftDefinition).where(
        models.ShiftDefinition.location_id == location_id
    )
    shifts = db.execute(stmt_shifts).scalars().all()
    shift_ids = [s.id for s in shifts]

    # --- Fetch shift demands ---
    stmt_demands = select(models.ShiftDemand).where(
        models.ShiftDemand.shift_definition_id.in_(shift_ids)
    )
    demands = db.execute(stmt_demands).scalars().all()

    # Fetch weights
    stmt_weights = select(models.LocationWeights).where(
        models.LocationWeights.location_id == location_id
    )
    weights = db.execute(stmt_weights).scalar_one_or_none()
    if not weights:
        weights = models.LocationWeights(location_id=location_id)

    # Fetch Employee Settings
    emp_ids = [e.id for e in employees]
    stmt_settings = select(models.EmployeeSettings).where(
        models.EmployeeSettings.employee_id.in_(emp_ids)
    )
    settings_list = db.execute(stmt_settings).scalars().all()
    emp_settings_dict = {s.employee_id: s for s in settings_list}

    # --- 2. Run Engine ---
    print(f"Starting optimization for {location.name} with {len(employees)} employees...")

    optimizer = ShiftOptimizer(
        location_id=location_id,
        employees=employees,
        shifts=shifts,
        demands=demands,
        weights=weights
    )

    status = optimizer.solve(emp_settings_dict)

    # --- 3. Handle Results ---
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        results = optimizer.get_results_as_dicts()
        objective_val = optimizer.solver.ObjectiveValue()

        # Save to DB
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
    # 1. Delete existing assignments
    stmt_delete = delete(models.Assignment).where(
        models.Assignment.location_id == location_id,
        models.Assignment.date >= start_date
    )
    db.execute(stmt_delete)

    # 2. Insert new assignments
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