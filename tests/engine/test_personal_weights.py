"""
Personal preference levels (EmployeeSettings.*_pref): each employee's level scales the location's
rest_gap, two_consecutive_nights and consecutive_nights weights for them.
"""
import pytest

from app.core.enums import ConstraintType, SoftPreference
from app.core.models import Employee, EmployeeSettings, LocationWeights
from app.engine.employee_history import EmployeeHistoricalState
from app.engine.weights import personal_weight
from tests.engine.helpers import QUIET, constraint, shift, solve

MORNING, EVENING = 1, 2
DAY_SHIFTS = [shift(MORNING, "07:00", "15:00"), shift(EVENING, "15:00", "23:00")]
NIGHT_ONLY = [shift(1, "23:00", "07:00")]


def _settings(employee_id: int, **prefs) -> EmployeeSettings:
    # target_shifts=0: the default target, (min + max) // 2 = 3, can't be reached within the
    # 1-day weeks below (the target delta is bounded by num_days), which would make them infeasible
    return EmployeeSettings(
        employee_id=employee_id, min_shifts_per_week=0, max_shifts_per_week=6, target_shifts=0, **prefs,
    )


def _must_work(employee_id, *day_shifts):
    return [constraint(employee_id, d, [s], ConstraintType.MUST_WORK) for d, s in day_shifts]


def _forced_nights(days, num_days, weights, settings=None, states=None):
    """Solve with employee 1 forced onto the 23:00 night on each of `days`."""
    return solve(
        [Employee(id=1, is_active=True)], NIGHT_ONLY, {(1, d): 1 for d in days}, weights=weights,
        settings=settings, states=states, constraints=_must_work(1, *[(d, 1) for d in days]), num_days=num_days,
    )


@pytest.mark.parametrize("level, expected", [
    (SoftPreference.DONT_CARE, 0),
    (SoftPreference.NORMAL, 10),
    (SoftPreference.PREFER_NOT, 20),
    (SoftPreference.AVOID, 40),
    (None, 10),
    ("prefer_not", 20),
])
def test_personal_weight_scales_the_base(level, expected):
    assert personal_weight(10, level) == expected


@pytest.mark.parametrize("relaxed, strict", [(1, 2), (2, 1)])
def test_short_rest_goes_to_the_employee_who_doesnt_mind(relaxed, strict):
    """Both work Sunday evening and one of them must take Monday morning (8 hours of rest)."""
    weights = LocationWeights(**{**QUIET, "rest_gap": 40})
    settings = {
        relaxed: _settings(relaxed, rest_gap_pref=SoftPreference.DONT_CARE),
        strict: _settings(strict, rest_gap_pref=SoftPreference.PREFER_NOT),
    }

    result = solve(
        [Employee(id=1, is_active=True), Employee(id=2, is_active=True)], DAY_SHIFTS,
        {(EVENING, 0): 2, (MORNING, 1): 1}, weights=weights, settings=settings, num_days=2,
    )

    assert result.status == "OPTIMAL"
    assert result.penalty == 0
    monday = [a.employee_id for a in result.assignments if a.day_idx == 1]
    assert monday == [relaxed]


@pytest.mark.parametrize("level, expected", [
    (SoftPreference.DONT_CARE, 0),
    (SoftPreference.PREFER_NOT, 80),
    (SoftPreference.AVOID, 160),
])
def test_short_rest_after_last_week_is_scaled(level, expected):
    """Last Saturday's evening ended at 23:00, then Sunday's 07:00 morning: 8 hours of rest."""
    weights = LocationWeights(**{**QUIET, "rest_gap": 40})
    states = {1: EmployeeHistoricalState(employee_id=1, last_shift_end=-60)}

    result = solve(
        [Employee(id=1, is_active=True)], DAY_SHIFTS, {(MORNING, 0): 1}, weights=weights, states=states,
        settings={1: _settings(1, rest_gap_pref=level)}, constraints=_must_work(1, (0, MORNING)), num_days=1,
    )

    assert result.status == "OPTIMAL"
    assert result.penalty == expected


@pytest.mark.parametrize("level, expected", [
    (SoftPreference.DONT_CARE, 0),
    (SoftPreference.PREFER_NOT, 60),
    (SoftPreference.AVOID, 120),
])
def test_two_nights_in_a_row_are_scaled(level, expected):
    weights = LocationWeights(**{**QUIET, "two_consecutive_nights": 30})

    result = _forced_nights([0, 1], 2, weights, settings={1: _settings(1, two_consecutive_nights_pref=level)})

    assert result.status == "OPTIMAL"
    assert result.penalty == expected


@pytest.mark.parametrize("level, expected", [
    (SoftPreference.DONT_CARE, 0),
    (SoftPreference.NORMAL, 1),
    (SoftPreference.PREFER_NOT, 2),
    (SoftPreference.AVOID, 4),
])
def test_every_level_differs_at_weight_one(level, expected):
    """Whole multipliers: even the smallest weight gives each level its own cost."""
    weights = LocationWeights(**{**QUIET, "two_consecutive_nights": 1})

    result = _forced_nights([0, 1], 2, weights, settings={1: _settings(1, two_consecutive_nights_pref=level)})

    assert result.status == "OPTIMAL"
    assert result.penalty == expected


def test_pairs_and_runs_of_three_are_scaled_separately():
    """3 nights: 2 pairs at 'dont_care' cost nothing, the run of 3 at 'prefer_not' costs double."""
    weights = LocationWeights(**{**QUIET, "two_consecutive_nights": 30, "consecutive_nights": 100})
    settings = {1: _settings(
        1, two_consecutive_nights_pref=SoftPreference.DONT_CARE, consecutive_nights_pref=SoftPreference.PREFER_NOT,
    )}

    result = _forced_nights([0, 1, 2], 3, weights, settings=settings)

    assert result.status == "OPTIMAL"
    assert result.penalty == 200


def test_night_carryover_is_scaled():
    """After last Friday and Saturday nights, Sunday night makes a pair and a run of 3 across the boundary."""
    weights = LocationWeights(**{**QUIET, "two_consecutive_nights": 30, "consecutive_nights": 100})
    states = {1: EmployeeHistoricalState(employee_id=1, trailing_nights=2)}
    settings = {1: _settings(
        1, two_consecutive_nights_pref=SoftPreference.PREFER_NOT, consecutive_nights_pref=SoftPreference.AVOID,
    )}

    result = _forced_nights([0], 1, weights, settings=settings, states=states)

    assert result.status == "OPTIMAL"
    assert result.penalty == 2 * 30 + 4 * 100


def test_normal_level_matches_no_settings():
    """'normal' is today's behaviour: the location's weights as they are."""
    weights = LocationWeights(**{**QUIET, "two_consecutive_nights": 30, "consecutive_nights": 100})
    normal = {1: _settings(
        1, two_consecutive_nights_pref=SoftPreference.NORMAL, consecutive_nights_pref=SoftPreference.NORMAL,
    )}

    with_normal = _forced_nights([0, 1, 2], 3, weights, settings=normal)
    without = _forced_nights([0, 1, 2], 3, weights)

    assert with_normal.penalty == without.penalty == 2 * 30 + 100


def test_night_preference_moves_nights_to_who_doesnt_mind():
    """Either employee can take Monday night next to their own; the one at 'dont_care' gets it."""
    weights = LocationWeights(**{**QUIET, "two_consecutive_nights": 30})
    settings = {
        1: _settings(1, two_consecutive_nights_pref=SoftPreference.AVOID),
        2: _settings(2, two_consecutive_nights_pref=SoftPreference.DONT_CARE),
    }

    # Employee 1 must take Sunday night and employee 2 Tuesday night; Monday night goes to the one
    # who doesn't mind 2 in a row
    result = solve(
        [Employee(id=1, is_active=True), Employee(id=2, is_active=True)], NIGHT_ONLY,
        {(1, 0): 1, (1, 1): 1, (1, 2): 1}, weights=weights, settings=settings,
        constraints=_must_work(1, (0, 1)) + _must_work(2, (2, 1)), num_days=3,
    )

    assert result.status == "OPTIMAL"
    assert result.penalty == 0
    assert [a.employee_id for a in result.assignments if a.day_idx == 1] == [2]
