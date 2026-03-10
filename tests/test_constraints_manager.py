import pytest
from ortools.sat.python import cp_model
from app.engine.constraints_manager import ConstraintManager


# ==========================================
# Mock Classes to simulate Database Models
# ==========================================

class MockEmployee:
    def __init__(self, emp_id):
        self.id = emp_id
        self.worked_last_sat_noon = False
        self.worked_last_sat_night = False


class MockShiftDefinition:
    def __init__(self, shift_id, num_staff):
        self.id = shift_id
        self.num_staff = num_staff


class MockEmployeeSettings:
    def __init__(self, min_s, max_s):
        self.min_shifts_per_week = min_s
        self.max_shifts_per_week = max_s


class MockWeights:
    def __init__(self):
        self.rest_gap = 10
        self.target_shifts = 10
        self.consecutive_nights = 10


# ==========================================
# Tests
# ==========================================

def test_daily_limit_constraint():
    """
    Test that an employee cannot be assigned to more than one shift per day.
    """
    # 1. Setup the environment and mock data
    model = cp_model.CpModel()

    # One employee, two shifts on the same day (Morning and Evening)
    employees = [MockEmployee(1)]
    shifts = [MockShiftDefinition(101, 1), MockShiftDefinition(102, 1)]
    weights = MockWeights()
    num_days = 1

    # 2. Create the boolean variables for the model
    shift_vars = {}
    for emp in employees:
        for d in range(num_days):
            for s in shifts:
                shift_vars[(emp.id, d, s.id)] = model.NewBoolVar(f'shift_{emp.id}_{d}_{s.id}')

    # 3. Initialize the Manager and apply Hard Constraints
    manager = ConstraintManager(model, shift_vars, employees, shifts, weights, num_days)
    employee_settings = {1: MockEmployeeSettings(0, 5)}

    manager._add_hard_constraints(employee_settings)

    # 4. The Attack: Force the model to assign BOTH shifts to the same employee today
    model.Add(shift_vars[(1, 0, 101)] == 1)
    model.Add(shift_vars[(1, 0, 102)] == 1)

    # 5. Solve the model
    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    # 6. Assert: The model MUST be INFEASIBLE (impossible to solve)
    # because our constraint strictly forbids two shifts in one day.
    assert status == cp_model.INFEASIBLE


def test_target_shifts_soft_constraint():
    """
    Test that the solver correctly balances the shifts between employees
    to hit their optimal 'target' (average of min and max shifts) and minimize penalties.
    """
    model = cp_model.CpModel()

    # 2 employees, 1 shift type (e.g., Morning) requiring 1 person per day
    employees = [MockEmployee(1), MockEmployee(2)]
    shifts = [MockShiftDefinition(101, 1)]
    weights = MockWeights()
    num_days = 7

    shift_vars = {}
    for emp in employees:
        for d in range(num_days):
            for s in shifts:
                shift_vars[(emp.id, d, s.id)] = model.NewBoolVar(f'shift_{emp.id}_{d}_{s.id}')

    manager = ConstraintManager(model, shift_vars, employees, shifts, weights, num_days)

    # Employee 1 Target: (2 + 6) // 2 = 4
    # Employee 2 Target: (1 + 5) // 2 = 3
    employee_settings = {
        1: MockEmployeeSettings(2, 6),
        2: MockEmployeeSettings(1, 5)
    }

    # Apply hard constraints (fill all 7 shifts, weekly limits, etc.)
    manager._add_hard_constraints(employee_settings)

    # Apply soft constraints (calculate penalties for missing the target)
    objective_terms = manager._get_objective_terms(employee_settings, {})

    # Set the objective: Minimize the total penalties
    model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    # The solver should find a perfect OPTIMAL solution
    assert status == cp_model.OPTIMAL

    # Count how many shifts each employee actually got
    emp1_shifts = sum(solver.Value(shift_vars[(1, d, 101)]) for d in range(num_days))
    emp2_shifts = sum(solver.Value(shift_vars[(2, d, 101)]) for d in range(num_days))

    # Assert that the solver hit the exact targets to avoid penalties
    assert emp1_shifts == 4
    assert emp2_shifts == 3