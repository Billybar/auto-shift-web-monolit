import pytest

from app.core.models import Employee, ShiftDefinition, LocationWeights, EmployeeSettings
from tests.engine.helpers import solve, worked

SUPERVISOR, GUARD, CONTROLLER = 10, 20, 30


@pytest.fixture
def shifts():
    return [ShiftDefinition(id=1, name="Morning"), ShiftDefinition(id=2, name="Evening")]


def employees(*ids):
    return [Employee(id=i, is_active=True) for i in ids]


# Weights that make every penalty zero except the ones a test turns on
QUIET = dict(target_shifts=0, rest_gap=0, consecutive_nights=0, max_nights=0, max_mornings=0,
             max_evenings=0, min_nights=0, min_mornings=0, min_evenings=0, secondary_position=0)


def test_demand_fulfillment(shifts):
    """Every slot is filled when there are enough people (moved from test_constraints_manager)."""
    result = solve(employees(1, 2), shifts, {(1, 0): 1, (2, 0): 1}, num_days=1)

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.unfilled == []
    assert sorted((a.shift_id, a.day_idx) for a in result.assignments) == [(1, 0), (2, 0)]


def test_one_role_per_shift_and_only_held_roles(shifts):
    """Each employee fills exactly one role in a shift, and only a role they hold."""
    positions = {1: {SUPERVISOR, GUARD}, 2: {GUARD}, 3: {GUARD}}
    demand = {(1, 0, SUPERVISOR): 1, (1, 0, GUARD): 2}

    result = solve(employees(1, 2, 3), shifts, demand, positions=positions, num_days=1)

    assert result.unfilled == []
    by_employee = {a.employee_id: a.position_id for a in result.assignments}
    assert len(result.assignments) == 3, "No employee may appear twice in the same shift"
    assert by_employee == {1: SUPERVISOR, 2: GUARD, 3: GUARD}
    for a in result.assignments:
        assert a.position_id in positions[a.employee_id]


def test_shortage_is_reported_not_infeasible(shifts):
    """Not enough supervisors: the rest of the schedule is returned and the empty slot is labelled."""
    positions = {1: {GUARD}, 2: {GUARD}}
    demand = {(1, 0, SUPERVISOR): 1, (1, 0, GUARD): 2}

    result = solve(employees(1, 2), shifts, demand, positions=positions, num_days=1)

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert [(u.shift_id, u.day_idx, u.position_id, u.missing) for u in result.unfilled] == [(1, 0, SUPERVISOR, 1)]
    assert {(a.employee_id, a.position_id) for a in result.assignments} == {(1, GUARD), (2, GUARD)}


def test_coverage_comes_first_even_with_large_penalties(shifts):
    """Working costs a huge target penalty, but the demand is still filled."""
    weights = LocationWeights(**{**QUIET, "target_shifts": 100_000})
    settings = {1: EmployeeSettings(employee_id=1, min_shifts_per_week=0, max_shifts_per_week=6, target_shifts=0)}
    demand = {(1, d): 1 for d in range(5)}

    result = solve(employees(1), shifts, demand, weights=weights, settings=settings, num_days=5)

    assert result.unfilled == []
    assert worked(result, 1) == 5
    assert result.penalty == 5 * 100_000


def test_no_over_staffing_and_zero_demand_roles_stay_empty(shifts):
    """Spare employees stay home; a role or shift without demand is never staffed."""
    positions = {e: {SUPERVISOR, GUARD} for e in range(1, 6)}
    demand = {(1, 0, GUARD): 2, (1, 0, SUPERVISOR): 0}

    result = solve(employees(1, 2, 3, 4, 5), shifts, demand, positions=positions, num_days=1)

    assert len(result.assignments) == 2
    assert all(a.position_id == GUARD and a.shift_id == 1 for a in result.assignments)


def test_primary_role_is_preferred(shifts):
    """With a free choice, auto-assign puts each employee in their primary role."""
    weights = LocationWeights(**{**QUIET, "secondary_position": 5})
    positions = {1: {SUPERVISOR, GUARD}, 2: {SUPERVISOR, GUARD}}
    primary = {1: GUARD, 2: SUPERVISOR}
    demand = {(1, 0, SUPERVISOR): 1, (1, 0, GUARD): 1}

    result = solve(employees(1, 2), shifts, demand, weights=weights, positions=positions, primary=primary, num_days=1)

    assert {a.employee_id: a.position_id for a in result.assignments} == {1: GUARD, 2: SUPERVISOR}
    assert result.penalty == 0


def test_secondary_role_penalty_and_no_primary(shifts):
    """A forced secondary role costs the weight; an employee with no primary role is never penalized."""
    weights = LocationWeights(**{**QUIET, "secondary_position": 7})
    demand = {(1, 0, SUPERVISOR): 1, (2, 0, SUPERVISOR): 1}
    positions = {1: {SUPERVISOR, GUARD}, 2: {SUPERVISOR}}
    primary = {1: GUARD, 2: None}

    result = solve(employees(1, 2), shifts, demand, weights=weights, positions=positions, primary=primary, num_days=1)

    assert result.unfilled == []
    assert result.penalty == 7


def test_must_work_is_honored(shifts):
    demand = {(1, 0): 1}
    constraints = [{"employee_id": 2, "day_idx": 0, "shift_id": 1, "type": "must_work"}]

    result = solve(employees(1, 2), shifts, demand, constraints=constraints, num_days=1)

    assert [(a.employee_id, a.shift_id) for a in result.assignments] == [(2, 1)]
    assert result.ignored_must_work == []


def test_must_work_without_an_eligible_role_is_ignored_and_reported(shifts):
    """The shift needs only supervisors; a guard's MUST_WORK there can't be honored."""
    demand = {(1, 0, SUPERVISOR): 1}
    positions = {1: {SUPERVISOR}, 2: {GUARD}}
    constraints = [{"employee_id": 2, "day_idx": 0, "shift_id": 1, "type": "must_work"}]

    result = solve(employees(1, 2), shifts, demand, positions=positions, constraints=constraints, num_days=1)

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert [(i.employee_id, i.shift_id, i.day_idx) for i in result.ignored_must_work] == [(2, 1, 0)]
    assert [(a.employee_id, a.position_id) for a in result.assignments] == [(1, SUPERVISOR)]


def test_employees_without_roles_are_skipped(shifts):
    positions = {1: {GUARD}, 2: set()}

    result = solve(employees(1, 2), shifts, {(1, 0, GUARD): 1}, positions=positions, num_days=1)

    assert result.skipped_employee_ids == [2]
    assert worked(result, 2) == 0
    assert worked(result, 1) == 1


def test_min_shifts_capped_and_reported(shifts):
    """
    The employee can work only 2 days (no demand on the others, one blocked), so a minimum of 4
    would make the week infeasible; it is lowered to 2 and reported.
    """
    demand = {(1, 0): 1, (1, 1): 1, (1, 2): 1}
    settings = {1: EmployeeSettings(employee_id=1, min_shifts_per_week=4, max_shifts_per_week=6)}
    constraints = [{"employee_id": 1, "day_idx": 2, "shift_id": 1, "type": "cannot_work"}]

    result = solve(employees(1), shifts, demand, settings=settings, constraints=constraints, num_days=7)

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert [(m.employee_id, m.requested, m.applied) for m in result.lowered_min_shifts] == [(1, 4, 2)]
    assert worked(result, 1) == 2
    assert [(u.day_idx, u.missing) for u in result.unfilled] == [(2, 1)]
