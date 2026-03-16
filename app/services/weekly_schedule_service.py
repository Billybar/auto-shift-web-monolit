from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import date, timedelta

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

    # --- Fetch Weekly Constraints (Employee specific requests/blocks) ---
    end_date = start_date + timedelta(days=6)
    stmt_constraints = select(models.WeeklyConstraint).where(
        models.WeeklyConstraint.employee_id.in_(emp_ids),
        models.WeeklyConstraint.date >= start_date,
        models.WeeklyConstraint.date <= end_date
    )
    db_constraints = db.execute(stmt_constraints).scalars().all()

    # convert date into indexes for OR-Tools
    parsed_constraints = []
    for c in db_constraints:
        # Calculate how many days passed since the start of the week (results in 0 to 6)
        day_index = (c.date - start_date).days

        parsed_constraints.append({
            "employee_id": c.employee_id,
            "day_idx": day_index,
            # Handling both potential DB column names just to be safe
            "shift_id": getattr(c, 'shift_definition_id', getattr(c, 'shift_id', None)),
            "type": getattr(c, 'type', 'CANNOT_WORK')
        })

    # --- 2. Run Engine ---
    print(f"Starting optimization for {location.name} with {len(employees)} employees...")

    optimizer = ShiftOptimizer(
        location_id=location_id,
        employees=employees,
        shifts=shifts,
        demands=demands,
        weights=weights,
        weekly_constraints=parsed_constraints
    )

    status = optimizer.solve(emp_settings_dict)

    # --- 3. Handle Results ---
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        results = optimizer.get_results_as_dicts()
        objective_val = optimizer.solver.ObjectiveValue()

        # Build the draft array to send back to the frontend immediately
        draft_assignments = []
        for res in results:
            assignment_date = start_date + timedelta(days=res["day_index"])
            draft_assignments.append({
                "location_id": location_id,
                "employee_id": res["employee_id"],
                "shift_id": res["shift_id"],
                "date": assignment_date.isoformat()  # Convert date to YYYY-MM-DD string format
            })

        return {
            "status": "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
            "objective": objective_val,
            "assignments_count": len(results),
            "draft_assignments": draft_assignments  # Send the draft array
        }

    else:
        return {
            "status": "FAILED",
            "objective": None,
            "assignments_count": 0
        }


# def _save_results_to_db(db: Session, results: List[dict], location_id: int, start_date: date, end_date: date):
#     # 1. Delete existing assignments
#     stmt_delete = delete(models.Assignment).where(
#         models.Assignment.location_id == location_id,
#         models.Assignment.date >= start_date,
#         models.Assignment.date <= end_date
#     )
#     db.execute(stmt_delete)
#
#     # 2. Insert new assignments
#     new_assignments = []
#     for res in results:
#         assignment_date = start_date + timedelta(days=res["day_index"])
#
#         assignment = models.Assignment(
#             location_id=location_id,
#             employee_id=res["employee_id"],
#             shift_id=res["shift_id"],
#             date=assignment_date
#         )
#         new_assignments.append(assignment)
#
#     db.add_all(new_assignments)
#     db.commit()