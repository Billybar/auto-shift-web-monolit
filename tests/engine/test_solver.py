from app.core.models import Employee, ShiftDefinition, LocationWeights, EmployeeSettings
from app.engine.solver import ShiftOptimizer
from tests.engine.helpers import solve, worked

SHIFTS = [ShiftDefinition(id=1, name="Morning"), ShiftDefinition(id=2, name="Evening")]


def test_phase_two_keeps_phase_one_shortage():
    """
    Working is penalized (target 0), so phase 2 alone would rather leave the slots empty.
    It must keep phase 1's minimum shortage: one slot can't be filled (one employee, two slots
    on day 0), the other three are.
    """
    weights = LocationWeights(target_shifts=50)
    settings = {1: EmployeeSettings(employee_id=1, min_shifts_per_week=0, max_shifts_per_week=6, target_shifts=0)}
    demand = {(1, 0): 1, (2, 0): 1, (1, 2): 1, (1, 4): 1}

    result = solve([Employee(id=1, is_active=True)], SHIFTS, demand, weights=weights, settings=settings, num_days=5)

    assert sum(u.missing for u in result.unfilled) == 1
    assert worked(result, 1) == 3
    assert result.penalty == 3 * 50


def test_status_failed_when_hard_rules_conflict():
    """Two MUST_WORK on the same day break the one-shift-per-day rule."""
    demand = {(1, 0): 1, (2, 0): 1}
    constraints = [
        {"employee_id": 1, "day_idx": 0, "shift_id": 1, "type": "must_work"},
        {"employee_id": 1, "day_idx": 0, "shift_id": 2, "type": "must_work"},
    ]

    result = solve([Employee(id=1, is_active=True)], SHIFTS, demand, constraints=constraints, num_days=1)

    assert result.status == "FAILED"
    assert result.failure_reason == "infeasible"
    assert result.assignments == [] and result.penalty is None


def test_status_optimal_when_both_phases_prove_it():
    result = solve([Employee(id=1, is_active=True)], SHIFTS, {(1, 0): 1}, num_days=1)

    assert result.status == "OPTIMAL"
    assert result.failure_reason is None


def test_time_limit_is_split_between_phases(monkeypatch):
    limits = []
    original = ShiftOptimizer._new_solver

    def recording(self, time_limit):
        limits.append(time_limit)
        return original(self, time_limit)

    monkeypatch.setattr(ShiftOptimizer, "_new_solver", recording)

    optimizer = ShiftOptimizer(
        [Employee(id=1, is_active=True)], SHIFTS, None, {(1, 0, 1): 1}, {1: {1}}, {1: 1},
        num_days=1, max_time_seconds=8, num_workers=1,
    )
    optimizer.solve({}, {})

    # Phase 1 gets half the budget, phase 2 whatever phase 1 left (a one-variable model takes far less than 4 s)
    assert len(limits) == 2
    assert limits[0] == 4
    assert 4 < limits[1] <= 8
