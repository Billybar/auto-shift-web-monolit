from typing import Dict, Set, List

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select
from datetime import date, timedelta

from app.core import models
from app.engine.solver import ShiftOptimizer
from ortools.sat.python import cp_model
from app.engine.employee_history import EmployeeHistoricalState # Updated file name

import logging
# Initialize logger for this module
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO) # Ensure basic config is set if not already configured in main.py


def calculate_historical_states(db: Session, location_id: int, start_date: date) -> Dict[int, EmployeeHistoricalState]:
    """
    Calculates the historical state (streak, weekend shifts) for all employees
    in a given location for the 7 days preceding the start_date.
    """
    history_start = start_date - timedelta(days=7)
    history_end = start_date - timedelta(days=1)

    stmt = select(models.Assignment).options(
        joinedload(models.Assignment.shift_def)
    ).where(
        models.Assignment.location_id == location_id,
        models.Assignment.date >= history_start,
        models.Assignment.date <= history_end
    )
    assignments = db.execute(stmt).scalars().all()

    emp_assignments: Dict[int, List[models.Assignment]] = {}
    for assignment in assignments:
        emp_assignments.setdefault(assignment.employee_id, []).append(assignment)

    states: Dict[int, EmployeeHistoricalState] = {}

    for emp_id, shifts in emp_assignments.items():
        worked_last_fri_night = False
        worked_last_sat_noon = False
        worked_last_sat_night = False
        worked_dates: Set[date] = set()

        for shift in shifts:
            worked_dates.add(shift.date)
            shift_name = shift.shift_def.name.strip()

            if shift.date.weekday() == 4: # Friday
                if "לילה" in shift_name:
                    worked_last_fri_night = True
            elif shift.date.weekday() == 5: # Saturday
                if "ערב" in shift_name or "צהריים" in shift_name:
                    worked_last_sat_noon = True
                elif "לילה" in shift_name:
                    worked_last_sat_night = True

        streak = 0
        current_check_date = history_end
        while current_check_date >= history_start:
            if current_check_date in worked_dates:
                streak += 1
                current_check_date -= timedelta(days=1)
            else:
                break

        states[emp_id] = EmployeeHistoricalState(
            employee_id=emp_id,
            history_streak=streak,
            worked_last_fri_night=worked_last_fri_night,
            worked_last_sat_noon=worked_last_sat_noon,
            worked_last_sat_night=worked_last_sat_night
        )

    return states

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

    # Convert dates to day indexes (0-6) for OR-Tools
    parsed_constraints = []
    for c in db_constraints:
        day_index = (c.date - start_date).days

        # Ensure the constraint falls within the current week
        if 0 <= day_index <= 6:
            parsed_constraints.append({
                "employee_id": c.employee_id,
                "day_idx": day_index,
                "shift_id": c.shift_id,
                # Ensure we capture the exact enum value (e.g., 'must_work', 'cannot_work')
                "type": c.constraint_type
            })

    # --- Fetch and Build Employee States (Historical Data) ---
    # Call the helper function to calculate states in-memory
    calculated_states = calculate_historical_states(db, location_id, start_date)

    employee_states_dict = {}
    for emp in employees:
        if emp.id in calculated_states:
            # Employee worked last week, use calculated state
            employee_states_dict[emp.id] = calculated_states[emp.id]
        else:
            # Employee did not work last week, create default empty state
            employee_states_dict[emp.id] = EmployeeHistoricalState(employee_id=emp.id)

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

    status = optimizer.solve(emp_settings_dict, employee_states_dict)

    # --- 3. Handle Results ---
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        results = optimizer.get_results_as_dicts()
        objective_val = optimizer.solver.ObjectiveValue()

        # --- Log the penalty score to the server terminal ---
        logger.info(f"Optimization finished successfully. Total penalties (Objective Value): {objective_val}")
        # ------------------------------------------------------------------

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