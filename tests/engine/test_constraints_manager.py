import pytest
from ortools.sat.python import cp_model
from app.engine.constraints_manager import ConstraintManager
from app.core.models import Employee, ShiftDefinition, LocationWeights
from app.engine.employee_history import EmployeeHistoricalState
from app.core.models import EmployeeSettings
from tests.engine.helpers import QUIET, shift, solve, worked

# ==========================================
#       Fixtures (Mock Data Setup)
# ==========================================
@pytest.fixture
def basic_setup():
    """Provides a minimal environment: 1 Day, 2 Shifts, 2 Employees."""
    # 1. Create Mock Employees
    emp1 = Employee(id=1, notes="Alice", is_active=True)
    emp2 = Employee(id=2, notes="Bob", is_active=True)
    employees = [emp1, emp2]

    # 2. Create Mock Shifts (Morning and Evening); the engine reads them by their hours
    shift_morning = ShiftDefinition(id=1, name="Morning", start_time="07:00", end_time="15:00")
    shift_evening = ShiftDefinition(id=2, name="Evening", start_time="15:00", end_time="23:00")
    shifts = [shift_morning, shift_evening]

    # 3. Create Mock Demands for Day 0, keyed (shift_id, day_idx) in the default role
    demands = {(1, 0): 1, (2, 0): 1}

    # 4. Create Default Weights
    weights = LocationWeights(location_id=1)

    return employees, shifts, demands, weights


# ================================================================
#                    Test Cases
# ================================================================


# ============================================
# ======       HARD CONSTRAINS       =========
# ============================================
def test_daily_limit_enforcement(basic_setup):
    """
    Test 1.2: Ensure an employee cannot work more than one shift per day.
    If forced to work two shifts via MUST_WORK, the model should become INFEASIBLE.
    """
    employees, shifts, demands, weights = basic_setup

    model = cp_model.CpModel()
    num_days = 1

    # Simulate variable creation
    shift_vars = {}
    for emp in employees:
        for d in range(num_days):
            for s_def in shifts:
                shift_vars[(emp.id, d, s_def.id)] = model.NewBoolVar(f'shift_e{emp.id}_d{d}_s{s_def.id}')

    # Create constraints that force Employee 1 to work BOTH Morning (1) and Evening (2) shifts
    conflicting_constraints = [
        {"employee_id": 1, "day_idx": 0, "shift_ids": [1], "type": "must_work"},
        {"employee_id": 1, "day_idx": 0, "shift_ids": [2], "type": "must_work"}
    ]

    manager = ConstraintManager(
        model=model,
        shift_vars=shift_vars,
        employees=employees,
        shifts=shifts,
        weights=weights,
        num_days=num_days
    )

    manager._add_hard_constraints(
        employee_settings={},
        employee_states={},
        weekly_constraints=conflicting_constraints
    )

    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    # Assertion: The solver must fail to find a solution because the daily limit hard constraint is violated
    assert status == cp_model.INFEASIBLE, "Solver should return INFEASIBLE when daily limit is violated."


def test_weekly_limits_enforcement(basic_setup):
    """
    Test 1.3: Ensure min_shifts_per_week and max_shifts_per_week are strictly enforced.
    We set a 5-day period requiring 1 worker per day (5 shifts total).
    Employee 1 is restricted to exactly 2 shifts. Employee 2 takes the rest.
    """
    employees, original_shifts, _, weights = basic_setup
    num_days = 5

    # Use only one shift (Morning) to simplify the math
    shifts = [original_shifts[0]]

    # 1 worker required for every day
    demand = {(shifts[0].id, d): 1 for d in range(num_days)}

    # Define Employee Settings (Employee 1 must work exactly 2 shifts)
    employee_settings = {
        1: EmployeeSettings(employee_id=1, min_shifts_per_week=2, max_shifts_per_week=2),
        2: EmployeeSettings(employee_id=2, min_shifts_per_week=0, max_shifts_per_week=5)
    }

    result = solve(employees, shifts, demand, weights=weights, settings=employee_settings, num_days=num_days)

    assert result.status in ("OPTIMAL", "FEASIBLE"), "Solver should find a valid schedule."
    assert result.unfilled == []

    # Assertions to verify the limits were enforced
    assert worked(result, 1) == 2, f"Employee 1 should have exactly 2 shifts, but got {worked(result, 1)}."
    assert worked(result, 2) == 3, f"Employee 2 should have exactly 3 shifts, but got {worked(result, 2)}."


def test_specific_constraints_enforcement(basic_setup):
    """
    Test 1.4: Ensure MUST_WORK and CANNOT_WORK constraints are strictly followed.
    Employee 1 MUST work Morning (Shift 1).
    Employee 2 CANNOT work Morning (Shift 1).
    """
    employees, shifts, demands, weights = basic_setup

    model = cp_model.CpModel()
    num_days = 1

    # Simulate variable creation
    shift_vars = {}
    for emp in employees:
        for d in range(num_days):
            for s_def in shifts:
                shift_vars[(emp.id, d, s_def.id)] = model.NewBoolVar(f'shift_e{emp.id}_d{d}_s{s_def.id}')

    # Define specific constraints
    weekly_constraints = [
        {"employee_id": 1, "day_idx": 0, "shift_ids": [1], "type": "must_work"},
        {"employee_id": 2, "day_idx": 0, "shift_ids": [1], "type": "cannot_work"}
    ]

    manager = ConstraintManager(
        model=model,
        shift_vars=shift_vars,
        employees=employees,
        shifts=shifts,
        weights=weights,
        num_days=num_days
    )

    manager._add_hard_constraints(
        employee_settings={},
        employee_states={},
        weekly_constraints=weekly_constraints
    )

    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    assert status in (cp_model.OPTIMAL, cp_model.FEASIBLE), "Solver should find a valid schedule."

    # Verify assignments match the specific constraints
    assert solver.Value(shift_vars[(1, 0, 1)]) == 1, "Employee 1 MUST work Morning."
    assert solver.Value(shift_vars[(2, 0, 1)]) == 0, "Employee 2 CANNOT work Morning."

# 2 shift in a row
def test_rest_under_8_hours_is_forbidden(basic_setup):
    """
    Test 1.5: Less than 8 hours between two shifts is a hard rule.
    Employee 1 is forced to work Day 0 Night (23:00-07:00) and Day 1 Morning (07:00): no rest at all.
    The solver must return INFEASIBLE.
    """
    employees, _, _, weights = basic_setup
    shifts = [
        ShiftDefinition(id=1, name="Morning", start_time="07:00", end_time="15:00"),
        ShiftDefinition(id=3, name="Night", start_time="23:00", end_time="07:00"),
    ]

    model = cp_model.CpModel()
    num_days = 2

    # Simulate variable creation
    shift_vars = {}
    for emp in employees:
        for d in range(num_days):
            for s_def in shifts:
                shift_vars[(emp.id, d, s_def.id)] = model.NewBoolVar(f'shift_e{emp.id}_d{d}_s{s_def.id}')

    # Force Employee 1 into a back-to-back situation: Night today, Morning tomorrow
    weekly_constraints = [
        {"employee_id": 1, "day_idx": 0, "shift_ids": [3], "type": "must_work"},
        {"employee_id": 1, "day_idx": 1, "shift_ids": [1], "type": "must_work"}
    ]

    manager = ConstraintManager(
        model=model,
        shift_vars=shift_vars,
        employees=employees,
        shifts=shifts,
        weights=weights,
        num_days=num_days
    )

    manager._add_hard_constraints(
        employee_settings={},
        employee_states={},
        weekly_constraints=weekly_constraints
    )

    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    assert status == cp_model.INFEASIBLE, "Solver should return INFEASIBLE when back-to-back constraint is violated."


def test_rest_of_8_to_10_hours_is_penalized(basic_setup):
    """
    Evening (15:00-23:00) then the next Morning (07:00) leaves exactly 8 hours: allowed, but it
    costs the rest_gap weight. Before shifts were read by their hours, a 2-shift site forbade it.
    """
    employees, shifts, _, _ = basic_setup
    weights = LocationWeights(**{**QUIET, "rest_gap": 40})
    constraints = [
        {"employee_id": 1, "day_idx": 0, "shift_ids": [2], "type": "must_work"},
        {"employee_id": 1, "day_idx": 1, "shift_ids": [1], "type": "must_work"},
    ]

    result = solve(employees, shifts, {(2, 0): 1, (1, 1): 1}, weights=weights, constraints=constraints, num_days=2)

    assert result.status == "OPTIMAL"
    assert result.penalty == 40

# 7 shifts in a row
def test_max_streak_and_history(basic_setup):
    """
    Test 1.6: Ensure the 7-day maximum streak is respected, including previous week history.
    Employee 1 has a history_streak of 5. This means they can only work 1 more consecutive day.
    If forced to work Day 0 and Day 1, they reach 7 consecutive days, which should trigger INFEASIBLE.
    """
    employees, shifts, _, weights = basic_setup

    model = cp_model.CpModel()
    num_days = 2

    # Simulate variable creation
    shift_vars = {}
    for emp in employees:
        for d in range(num_days):
            for s_def in shifts:
                shift_vars[(emp.id, d, s_def.id)] = model.NewBoolVar(f'shift_e{emp.id}_d{d}_s{s_def.id}')

    # Inject historical state for Employee 1
    employee_states = {
        1: EmployeeHistoricalState(employee_id=1, history_streak=5)
    }

    # Force Employee 1 to work both Day 0 and Day 1
    weekly_constraints = [
        {"employee_id": 1, "day_idx": 0, "shift_ids": [shifts[0].id], "type": "must_work"},
        {"employee_id": 1, "day_idx": 1, "shift_ids": [shifts[0].id], "type": "must_work"}
    ]

    manager = ConstraintManager(
        model=model,
        shift_vars=shift_vars,
        employees=employees,
        shifts=shifts,
        weights=weights,
        num_days=num_days
    )

    manager._add_hard_constraints(
        employee_settings={},
        employee_states=employee_states,
        weekly_constraints=weekly_constraints
    )

    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    assert status == cp_model.INFEASIBLE, "Solver should return INFEASIBLE when max streak (including history) is exceeded."


# ============================================
# ======       SOFT CONSTRAINS       =========
# ============================================
# target shift
def test_target_shifts_penalty(basic_setup):
    """
    Test 2.1: Ensure that the penalty increases when an employee
    deviates from their target shift count.
    """
    employees, original_shifts, _, _ = basic_setup
    num_days = 5

    # Use only morning shift to isolate tests from night/evening penalties
    shifts = [original_shifts[0]]
    demand = {(shifts[0].id, d): 1 for d in range(num_days)}

    # Setup weights: only Target Shifts penalty matters for this test
    weights = LocationWeights(location_id=1, target_shifts=40)

    # Force Employee 1 to take all 5 shifts
    weekly_constraints = [
        {"employee_id": 1, "day_idx": d, "shift_ids": [shifts[0].id], "type": "must_work"} for d in range(num_days)
    ]

    # Target for both is explicitly set to 3
    # Employee 1 will work 5 shifts -> delta is 2 -> penalty: 2 * 40 = 80
    # Employee 2 will work 0 shifts -> delta is 3 -> penalty: 3 * 40 = 120
    # Total expected penalty: 200
    employee_settings = {
        1: EmployeeSettings(employee_id=1, min_shifts_per_week=0, max_shifts_per_week=6, target_shifts=3),
        2: EmployeeSettings(employee_id=2, min_shifts_per_week=0, max_shifts_per_week=6, target_shifts=3)
    }

    result = solve(
        employees, shifts, demand, weights=weights, settings=employee_settings,
        constraints=weekly_constraints, num_days=num_days,
    )

    assert result.status == "OPTIMAL", "Solver should find an optimal solution."
    assert result.penalty == 200, f"Expected penalty of 200, but got {result.penalty}"

# max/min prefer penalise
def test_shift_type_quotas_penalty(basic_setup):
    """
    Test 2.2: Ensure that exceeding specific shift type quotas (e.g., max_nights)
    applies the correct penalty.
    """
    employees, _, _, _ = basic_setup
    num_days = 3

    # Create 3 shifts; the 23:00 one is the Night shift
    shifts = [
        ShiftDefinition(id=1, name="Morning", start_time="07:00", end_time="15:00"),
        ShiftDefinition(id=2, name="Evening", start_time="15:00", end_time="23:00"),
        ShiftDefinition(id=3, name="Night", start_time="23:00", end_time="07:00")
    ]

    # Demand: 1 worker for the Night shift (id=3) for all 3 days
    demand = {(3, d): 1 for d in range(num_days)}

    # Set weights: Isolate the MAX_NIGHTS penalty by setting others to 0
    weights = LocationWeights(
        location_id=1,
        max_nights=50,
        target_shifts=0,
        consecutive_nights=0
    )

    # Force Employee 1 to take all 3 Night shifts
    weekly_constraints = [
        {"employee_id": 1, "day_idx": d, "shift_ids": [3], "type": "must_work"} for d in range(num_days)
    ]

    # Employee 1 max_nights = 1. They work 3. Excess = 2. Penalty = 2 * 50 = 100.
    employee_settings = {
        1: EmployeeSettings(employee_id=1, min_shifts_per_week=0, max_shifts_per_week=5, max_nights=1),
        2: EmployeeSettings(employee_id=2, min_shifts_per_week=0, max_shifts_per_week=5, max_nights=5)
    }

    result = solve(
        employees, shifts, demand, weights=weights, settings=employee_settings,
        constraints=weekly_constraints, num_days=num_days,
    )

    assert result.status == "OPTIMAL", "Solver should find an optimal solution."
    assert result.penalty == 100, f"Expected penalty of 100, but got {result.penalty}"


# 3 nights in a row
def test_consecutive_nights_penalty(basic_setup):
    """
    Test 2.3: Ensure that working 3 consecutive nights applies a penalty.
    Tests both intra-week sequences and carry-over from the previous week.
    """
    employees, _, _, _ = basic_setup
    num_days = 3

    # Create 3 shifts; the 23:00 one is the Night shift
    shifts = [
        ShiftDefinition(id=1, name="Morning", start_time="07:00", end_time="15:00"),
        ShiftDefinition(id=2, name="Evening", start_time="15:00", end_time="23:00"),
        ShiftDefinition(id=3, name="Night", start_time="23:00", end_time="07:00")
    ]

    # Isolate CONSECUTIVE_NIGHTS penalty
    weights = LocationWeights(
        location_id=1,
        consecutive_nights=100,
        target_shifts=0,
        max_nights=0,
        min_nights=0,
        rest_gap=0
    )

    # Employee 1: Works Day 0, Day 1, Day 2 Night (Intra-week penalty)
    # Employee 2: Works Day 0 Night (Carry-over penalty based on history)
    weekly_constraints = [
        {"employee_id": 1, "day_idx": 0, "shift_ids": [3], "type": "must_work"},
        {"employee_id": 1, "day_idx": 1, "shift_ids": [3], "type": "must_work"},
        {"employee_id": 1, "day_idx": 2, "shift_ids": [3], "type": "must_work"},

        {"employee_id": 2, "day_idx": 0, "shift_ids": [3], "type": "must_work"}
    ]

    # Setup History State for Employee 2: worked last Friday and Saturday nights
    employee_states = {
        2: EmployeeHistoricalState(employee_id=2, trailing_nights=2)
    }

    # Exact demands to match our MUST_WORK constraints
    demand = {
        (3, 0): 2,  # Emp 1 + Emp 2
        (3, 1): 1,  # Emp 1
        (3, 2): 1,  # Emp 1
    }

    # Empty employee_settings because we disabled Target and Quota penalties
    result = solve(
        employees, shifts, demand, weights=weights, states=employee_states,
        constraints=weekly_constraints, num_days=num_days,
    )

    assert result.status == "OPTIMAL", "Solver should find an optimal solution."
    # 100 from Emp1 + 100 from Emp2
    assert result.penalty == 200, f"Expected penalty of 200, but got {result.penalty}"

# rest gap 8-8 (include weekend before in calculate)
def test_weekend_rest_gap_penalty(basic_setup):
    """
    Test 2.4: Ensure that working Sunday morning/evening 8 hours after the end of a
    Saturday evening/night shift applies the REST_GAP penalty based on historical state.
    """
    employees, _, _, _ = basic_setup
    num_days = 1

    # Create Morning (id=1) and Evening (id=2) shifts
    shifts = [
        ShiftDefinition(id=1, name="Morning", start_time="07:00", end_time="15:00"),
        ShiftDefinition(id=2, name="Evening", start_time="15:00", end_time="23:00")
    ]

    # Isolate REST_GAP penalty, set all others to 0
    weights = LocationWeights(
        location_id=1,
        rest_gap=40,
        target_shifts=0,
        consecutive_nights=0,
        max_nights=0,
        max_mornings=0,
        max_evenings=0
    )

    # Employee 1 worked Saturday evening (ended 23:00, 60 minutes before Sunday),
    # Employee 2 worked Saturday night (ended Sunday 07:00)
    employee_states = {
        1: EmployeeHistoricalState(employee_id=1, last_shift_end=-60),
        2: EmployeeHistoricalState(employee_id=2, last_shift_end=7 * 60)
    }

    # Force assignments for Sunday (Day 0)
    weekly_constraints = [
        {"employee_id": 1, "day_idx": 0, "shift_ids": [1], "type": "must_work"},  # Sunday Morning
        {"employee_id": 2, "day_idx": 0, "shift_ids": [2], "type": "must_work"}  # Sunday Evening
    ]

    # Exact demands to match the forced assignments
    demand = {(1, 0): 1, (2, 0): 1}

    result = solve(
        employees, shifts, demand, weights=weights, states=employee_states,
        constraints=weekly_constraints, num_days=num_days,
    )

    assert result.status == "OPTIMAL", "Solver should find an optimal solution."
    # 40 (Emp 1) + 40 (Emp 2) = 80
    assert result.penalty == 80, f"Expected penalty of 80, but got {result.penalty}"

# edge case
def test_missing_data_fallbacks(basic_setup):
    """
    Test 3.2: Ensure the manager doesn't crash when settings or states are missing.
    It should use safe defaults for missing employees.
    """
    employees, shifts, demands, weights = basic_setup
    model = cp_model.CpModel()
    num_days = 2

    shift_vars = {}
    for emp in employees:
        for d in range(num_days):
            for s_def in shifts:
                shift_vars[(emp.id, d, s_def.id)] = model.NewBoolVar(f'shift_e{emp.id}_d{d}_s{s_def.id}')

    # CRITICAL: We only provide settings for Employee 1.
    # Employee 2 is completely missing from the settings dictionary.
    partial_settings = {
        1: EmployeeSettings(employee_id=1, min_shifts_per_week=1, max_shifts_per_week=2, target_shifts=None)
    }

    # We provide NO history state at all
    empty_states = {}

    manager = ConstraintManager(model, shift_vars, employees, shifts, weights, num_days=num_days)

    # This should NOT raise a KeyError
    try:
        manager._add_hard_constraints(partial_settings, empty_states, [])
        objective_terms = manager._get_objective_terms(partial_settings, empty_states)
        model.Minimize(sum(objective_terms))
    except KeyError as e:
        pytest.fail(f"ConstraintManager crashed with KeyError on missing data: {e}")
    except Exception as e:
        pytest.fail(f"ConstraintManager crashed with unexpected error: {e}")

    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    assert status in [cp_model.OPTIMAL, cp_model.FEASIBLE], "Solver should still find a solution with missing data."

 # edge case - when no employees or shift defined
def test_empty_inputs_gracefully(basic_setup):
    """
    Test 3.3: Ensure the manager handles empty lists of employees or shifts
    without raising exceptions.
    """
    # We create our own empty shifts to avoid the default demand of 1
    model = cp_model.CpModel()
    num_days = 5

    # Scenario: Zero employees, and Shifts that don't require anyone
    empty_employees = []

    empty_requirement_shifts = [
        ShiftDefinition(id=1, name="Empty Morning", start_time="07:00", end_time="15:00"),
        ShiftDefinition(id=2, name="Empty Evening", start_time="15:00", end_time="23:00")
    ]

    shift_vars = {}  # No variables possible with 0 employees
    weights = LocationWeights(location_id=1)  # Default weights

    manager = ConstraintManager(model, shift_vars, empty_employees, empty_requirement_shifts, weights,
                                num_days=num_days)

    try:
        # Check if the logic crashes
        manager._add_hard_constraints({}, {}, [])
        objective_terms = manager._get_objective_terms({}, {})

        assert isinstance(objective_terms, list)
        assert len(objective_terms) == 0

    except Exception as e:
        pytest.fail(f"ConstraintManager crashed on empty inputs: {e}")

    # Now the solver should find an OPTIMAL solution (0 employees for 0 demand is possible!)
    solver = cp_model.CpSolver()
    status = solver.Solve(model)
    assert status == cp_model.OPTIMAL, f"Expected OPTIMAL (4), but got {status}. Check if demand is truly 0."

def test_sunday_morning_after_saturday_night_history(basic_setup):
    """
    Test 1.7: Ensure Sunday morning shift is blocked if the employee worked Saturday night last week.
    If forced via MUST_WORK, the model should become INFEASIBLE.
    """
    employees, shifts, demands, weights = basic_setup
    model = cp_model.CpModel()
    num_days = 1  # Testing only Sunday (Day 0)

    # Simulate variable creation
    shift_vars = {}
    for emp in employees:
        for d in range(num_days):
            for s_def in shifts:
                shift_vars[(emp.id, d, s_def.id)] = model.NewBoolVar(f'shift_e{emp.id}_d{d}_s{s_def.id}')

    # 1. Historical state: Employee 1 worked Saturday night last week, which ended Sunday 07:00
    # Using the actual EmployeeHistoricalState dataclass
    employee_states = {
        1: EmployeeHistoricalState(employee_id=1, last_shift_end=7 * 60)
    }

    # 2. Conflicting Constraint: Force Employee 1 to work Sunday Morning (Day 0, Shift ID 1)
    # This directly contradicts the new hard constraint
    conflicting_constraints = [
        {"employee_id": 1, "day_idx": 0, "shift_ids": [shifts[0].id], "type": "must_work"}
    ]

    manager = ConstraintManager(
        model=model,
        shift_vars=shift_vars,
        employees=employees,
        shifts=shifts,
        weights=weights,
        num_days=num_days
    )

    # 3. Apply hard constraints
    manager._add_hard_constraints(
        employee_settings={},
        employee_states=employee_states,
        weekly_constraints=conflicting_constraints
    )

    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    # Assertion: The solver must fail because Sunday morning is now strictly forbidden for this employee
    assert status == cp_model.INFEASIBLE, "Solver should return INFEASIBLE when Sunday morning is forced after Saturday night history."


# ============================================
# ======   SHIFTS READ BY THEIR HOURS   ======
# ============================================
# A site with two morning shifts, 06:00 and 07:00
M6, M7, EVENING, NIGHT = 1, 2, 3, 4
FOUR_SHIFTS = [shift(M6, "06:00", "14:00"), shift(M7, "07:00", "15:00"), shift(EVENING, "15:00", "23:00"), shift(NIGHT, "23:00", "07:00")]


def _one_employee():
    return [Employee(id=1, is_active=True)]


def _must_work(*day_shifts):
    return [{"employee_id": 1, "day_idx": d, "shift_ids": [s], "type": "must_work"} for d, s in day_shifts]


def test_four_shift_site_rest_rules():
    """Evening, then the next 06:00 morning, leaves 7 hours (forbidden); the 07:00 morning 8 hours (penalized)."""
    weights = LocationWeights(**{**QUIET, "rest_gap": 40})

    def evening_then(morning):
        return solve(
            _one_employee(), FOUR_SHIFTS, {(EVENING, 0): 1, (morning, 1): 1}, weights=weights,
            constraints=_must_work((0, EVENING), (1, morning)), num_days=2,
        )

    too_short = evening_then(M6)
    short = evening_then(M7)

    assert too_short.status == "FAILED" and too_short.failure_reason == "infeasible"
    assert short.status == "OPTIMAL" and short.penalty == 40


def test_category_limits_count_every_shift_of_the_category():
    """Both morning shifts are mornings: one of each makes 2, one over max_mornings=1."""
    weights = LocationWeights(**{**QUIET, "max_mornings": 50})
    settings = {1: EmployeeSettings(employee_id=1, min_shifts_per_week=0, max_shifts_per_week=6, max_mornings=1)}

    result = solve(
        _one_employee(), FOUR_SHIFTS, {(M6, 0): 1, (M7, 1): 1}, weights=weights, settings=settings,
        constraints=_must_work((0, M6), (1, M7)), num_days=2,
    )

    assert result.status == "OPTIMAL"
    assert result.penalty == 50


def test_three_nights_over_two_night_shifts():
    """Any night-category shift counts toward 3 nights in a row, here 21:00 and 23:00 nights mixed."""
    early, late = 1, 2
    shifts = [shift(early, "21:00", "05:00"), shift(late, "23:00", "07:00")]
    weights = LocationWeights(**{**QUIET, "consecutive_nights": 100})
    plan = [(0, early), (1, late), (2, early)]

    result = solve(
        _one_employee(), shifts, {(s, d): 1 for d, s in plan}, weights=weights,
        constraints=_must_work(*plan), num_days=3,
    )

    assert result.status == "OPTIMAL"
    assert result.penalty == 100


def test_night_then_evening_is_penalized_within_the_week():
    """Night (ends 07:00), then the next Evening (15:00): 8 hours of rest, penalized like evening then morning."""
    shifts = [shift(1, "07:00", "15:00"), shift(2, "15:00", "23:00"), shift(3, "23:00", "07:00")]
    weights = LocationWeights(**{**QUIET, "rest_gap": 40})

    result = solve(
        _one_employee(), shifts, {(3, 0): 1, (2, 1): 1}, weights=weights,
        constraints=_must_work((0, 3), (1, 2)), num_days=2,
    )

    assert result.status == "OPTIMAL"
    assert result.penalty == 40


def test_after_midnight_shift_is_the_night_after_its_day():
    """
    The work day runs 04:00 to 04:00, so the 00:00-08:00 shift in day 0's column starts at the end
    of day 0, and day 1's 08:00 morning follows it with no rest at all.
    """
    shifts = [shift(1, "08:00", "16:00"), shift(2, "16:00", "00:00"), shift(3, "00:00", "08:00")]

    result = solve(
        _one_employee(), shifts, {(3, 0): 1, (1, 1): 1}, constraints=_must_work((0, 3), (1, 1)), num_days=2,
    )

    assert result.status == "FAILED" and result.failure_reason == "infeasible"


def test_night_carryover_counts_both_windows():
    """
    After last Friday and Saturday nights, Sunday and Monday nights make two runs of 3,
    (Fri, Sat, Sun) and (Sat, Sun, Mon), like a 4-night run inside the week.
    """
    shifts = [shift(1, "23:00", "07:00")]
    weights = LocationWeights(**{**QUIET, "consecutive_nights": 100})
    states = {1: EmployeeHistoricalState(employee_id=1, trailing_nights=2)}

    result = solve(
        _one_employee(), shifts, {(1, 0): 1, (1, 1): 1}, weights=weights, states=states,
        constraints=_must_work((0, 1), (1, 1)), num_days=2,
    )

    assert result.status == "OPTIMAL"
    assert result.penalty == 200


def test_history_rest_runs_from_the_end_of_last_weeks_shift():
    """
    Last Saturday's evening shift ended at 23:00: Sunday's 06:00 morning comes 7 hours later
    (forbidden), the 07:00 morning 8 hours later (penalized).
    """
    weights = LocationWeights(**{**QUIET, "rest_gap": 40})
    states = {1: EmployeeHistoricalState(employee_id=1, last_shift_end=-60)}

    def sunday(morning):
        return solve(
            _one_employee(), FOUR_SHIFTS, {(morning, 0): 1}, weights=weights, states=states,
            constraints=_must_work((0, morning)), num_days=1,
        )

    too_short = sunday(M6)
    short = sunday(M7)

    assert too_short.status == "FAILED" and too_short.failure_reason == "infeasible"
    assert short.status == "OPTIMAL" and short.penalty == 40
