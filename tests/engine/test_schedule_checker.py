from app.core import shift_timing
from app.core.models import Employee, EmployeeSettings, LocationWeights
from app.engine.employee_history import EmployeeHistoricalState
from app.engine.schedule_checker import Placement, check_schedule
from tests.engine.helpers import DEFAULT_POSITION, QUIET, shift, solve

MORNING, EVENING, NIGHT, MIDNIGHT = 1, 2, 3, 4
SHIFTS = [
    shift(MORNING, "07:00", "15:00"),
    shift(EVENING, "15:00", "23:00"),
    shift(NIGHT, "23:00", "07:00"),
    # Starts before 04:00, so it is the night after its column's day
    shift(MIDNIGHT, "00:00", "08:00"),
]
# Every shift needs one employee every day
DEMAND = {(s.id, d, DEFAULT_POSITION): 1 for s in SHIFTS for d in range(7)}


def check(placements, *, settings=None, states=None, constraints=None, positions=None, demand=None, active=(1,)):
    if positions is None:
        positions = {emp_id: {DEFAULT_POSITION} for emp_id in active}
    return check_schedule(
        placements,
        shifts=SHIFTS,
        demand=DEMAND if demand is None else demand,
        employee_positions=positions,
        weekly_constraints=constraints or [],
        employee_settings=settings or {},
        employee_states=states or {},
        active_employee_ids=active,
    )


def at(shift_id, day_idx, employee_id=1, **kwargs):
    return Placement(employee_id=employee_id, shift_id=shift_id, day_idx=day_idx, position_id=DEFAULT_POSITION, **kwargs)


def codes(issues):
    return [i.code for i in issues]


def test_clean_week_has_no_issues():
    result = check([at(MORNING, d) for d in range(5)])

    assert result.violations == []


def test_employee_without_settings_or_history_is_checked_on_placements_only():
    result = check([at(MORNING, 0), at(MORNING, 1)], settings={}, states={})

    assert result.violations == []


def test_two_shifts_on_one_work_day():
    result = check([at(MORNING, 2), at(NIGHT, 2)])

    assert codes(result.violations) == ["two_shifts_same_day"]
    assert set(result.violations[0].cells) == {(MORNING, 2), (NIGHT, 2)}
    assert result.violations[0].day_idx == 2


def test_night_then_next_morning_is_short_rest():
    result = check([at(NIGHT, 0), at(MORNING, 1)])

    assert codes(result.violations) == ["short_rest"]
    assert result.violations[0].rest_minutes == 0
    assert result.violations[0].cells == ((NIGHT, 0), (MORNING, 1))


def test_midnight_shift_overlaps_the_next_morning():
    """00:00-08:00 in Sunday's column runs into Monday 07:00."""
    result = check([at(MIDNIGHT, 0), at(MORNING, 1)])

    assert codes(result.violations) == ["short_rest"]
    assert result.violations[0].rest_minutes == -60


def test_evening_then_next_morning_is_allowed():
    """8 hours of rest: only penalized by the engine (a soft rule), so not checked."""
    result = check([at(EVENING, 0), at(MORNING, 1)])

    assert result.violations == []


def test_rest_of_exactly_min_rest_is_allowed():
    # Ends at 23:15, the next shift starts at 07:00: 7:45 of rest
    result = check([at(EVENING, 0, end_time="23:15"), at(MORNING, 1)])

    assert result.violations == []


def test_rest_one_minute_under_min_rest_is_a_violation():
    result = check([at(EVENING, 0, end_time="23:16"), at(MORNING, 1)])

    assert codes(result.violations) == ["short_rest"]
    assert result.violations[0].rest_minutes == shift_timing.MIN_REST - 1


def test_edited_hours_can_remove_a_short_rest():
    # The night ends at 23:59 instead of 07:00; the next morning starts at 10:00
    result = check([at(NIGHT, 0, end_time="23:59"), at(MORNING, 1, start_time="10:00")])

    assert result.violations == []


def test_short_rest_after_last_week():
    # Last week's night ended Sunday 07:00 (+420), and the Sunday morning starts at 07:00
    states = {1: EmployeeHistoricalState(employee_id=1, last_shift_end=7 * 60)}

    result = check([at(MORNING, 0)], states=states)

    assert codes(result.violations) == ["short_rest"]
    assert result.violations[0].from_previous_week
    assert result.violations[0].cells == ((MORNING, 0),)


def test_eight_hours_after_last_week_is_allowed():
    # Last week's evening ended Saturday 23:00 (-60): 8 hours before Sunday 07:00
    states = {1: EmployeeHistoricalState(employee_id=1, last_shift_end=-60)}

    result = check([at(MORNING, 0)], states=states)

    assert result.violations == []


def test_seven_days_in_a_row():
    result = check([at(MORNING, d) for d in range(7)])

    assert codes(result.violations) == ["work_streak"]
    issue = result.violations[0]
    assert (issue.days, issue.limit) == (7, shift_timing.MAX_WORK_STREAK)
    # Only the day past the limit is marked
    assert issue.cells == ((MORNING, 6),)


def test_six_days_in_a_row_is_allowed():
    result = check([at(MORNING, d) for d in range(6)])

    assert result.violations == []


def test_streak_counts_last_week():
    states = {1: EmployeeHistoricalState(employee_id=1, history_streak=6)}

    result = check([at(MORNING, 0)], states=states)

    assert codes(result.violations) == ["work_streak"]
    assert result.violations[0].days == 7
    assert result.violations[0].cells == ((MORNING, 0),)


def test_streak_of_last_week_alone_is_not_flagged():
    states = {1: EmployeeHistoricalState(employee_id=1, history_streak=7)}

    result = check([at(MORNING, 1)], states=states)

    assert result.violations == []


def test_cannot_work():
    constraints = [{"employee_id": 1, "day_idx": 3, "shift_ids": [MORNING, EVENING], "type": "cannot_work"}]

    result = check([at(EVENING, 3)], constraints=constraints)

    assert codes(result.violations) == ["cannot_work"]
    assert result.violations[0].cells == ((EVENING, 3),)


def test_must_work_missed():
    constraints = [{"employee_id": 1, "day_idx": 2, "shift_ids": [MORNING], "type": "must_work"}]

    assert codes(check([at(EVENING, 2)], constraints=constraints).violations) == ["must_work_missed"]
    assert check([at(MORNING, 2)], constraints=constraints).violations == []


def test_must_work_with_no_eligible_role_is_ignored():
    """As in the engine: no shift of the row needs one of the employee's roles that day."""
    constraints = [{"employee_id": 1, "day_idx": 2, "shift_ids": [MORNING], "type": "must_work"}]
    demand = {key: req for key, req in DEMAND.items() if key[:2] != (MORNING, 2)}

    result = check([], constraints=constraints, demand=demand)

    assert result.violations == []


def test_must_work_of_inactive_employee_is_ignored():
    constraints = [{"employee_id": 2, "day_idx": 2, "shift_ids": [MORNING], "type": "must_work"}]

    result = check([], constraints=constraints, positions={1: {DEFAULT_POSITION}, 2: {DEFAULT_POSITION}})

    assert result.violations == []


def test_max_shifts():
    settings = {1: EmployeeSettings(employee_id=1, min_shifts_per_week=0, max_shifts_per_week=2)}

    result = check([at(MORNING, d) for d in range(3)], settings=settings)

    assert codes(result.violations) == ["max_shifts"]
    assert (result.violations[0].count, result.violations[0].limit) == (3, 2)


def test_min_shifts():
    settings = {1: EmployeeSettings(employee_id=1, min_shifts_per_week=3, max_shifts_per_week=6)}

    result = check([at(MORNING, 0)], settings=settings)

    assert codes(result.violations) == ["min_shifts"]
    assert (result.violations[0].count, result.violations[0].limit) == (1, 3)


def test_min_shifts_is_lowered_to_workable_days():
    """Blocked on every day but two, so a minimum of 5 means 2, as in the engine."""
    settings = {1: EmployeeSettings(employee_id=1, min_shifts_per_week=5, max_shifts_per_week=6)}
    constraints = [
        {"employee_id": 1, "day_idx": d, "shift_ids": [s.id for s in SHIFTS], "type": "cannot_work"}
        for d in range(2, 7)
    ]

    result = check([at(MORNING, 0), at(MORNING, 1)], settings=settings, constraints=constraints)

    assert result.violations == []


def test_position_not_held():
    placement = Placement(employee_id=1, shift_id=MORNING, day_idx=0, position_id=99)

    result = check([placement])

    assert codes(result.violations) == ["position_not_held"]
    assert result.violations[0].position_id == 99


def test_row_without_position_skips_the_role_check():
    result = check([Placement(employee_id=1, shift_id=MORNING, day_idx=0)])

    assert result.violations == []


def test_nights_in_a_row_are_not_checked():
    """Three nights in a row is a soft rule (only penalized by the engine)."""
    states = {1: EmployeeHistoricalState(employee_id=1, trailing_nights=2)}

    result = check([at(NIGHT, d) for d in range(4)], states=states)

    assert result.violations == []


# --- Drift: whatever the engine produces passes the checker ---

def _engine_week_passes(employees, *, settings=None, states=None, constraints=None, demand=None):
    shifts = SHIFTS[:3]
    demand = demand or {(s.id, d): 1 for s in shifts for d in range(7)}
    result = solve(
        employees, shifts, demand, weights=LocationWeights(**QUIET),
        settings=settings, states=states, constraints=constraints,
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    placements = [
        Placement(employee_id=a.employee_id, shift_id=a.shift_id, day_idx=a.day_idx, position_id=a.position_id)
        for a in result.assignments
    ]
    full_demand = {(*key, DEFAULT_POSITION): req for key, req in demand.items()}
    checked = check_schedule(
        placements,
        shifts=shifts,
        demand=full_demand,
        employee_positions={e.id: {DEFAULT_POSITION} for e in employees},
        weekly_constraints=constraints or [],
        employee_settings=settings or {},
        employee_states=states or {},
        active_employee_ids=[e.id for e in employees],
    )
    assert checked.violations == []


def test_engine_output_passes_with_history():
    employees = [Employee(id=i, is_active=True) for i in range(1, 5)]
    states = {
        1: EmployeeHistoricalState(employee_id=1, history_streak=6, last_shift_end=7 * 60),
        2: EmployeeHistoricalState(employee_id=2, history_streak=3, trailing_nights=2, last_shift_end=-60),
    }

    _engine_week_passes(employees, states=states)


def test_engine_output_passes_with_requests_and_limits():
    employees = [Employee(id=i, is_active=True) for i in range(1, 6)]
    settings = {
        1: EmployeeSettings(employee_id=1, min_shifts_per_week=5, max_shifts_per_week=5),
        2: EmployeeSettings(employee_id=2, min_shifts_per_week=0, max_shifts_per_week=2),
        3: EmployeeSettings(employee_id=3, min_shifts_per_week=6, max_shifts_per_week=6),
    }
    constraints = [
        {"employee_id": 1, "day_idx": 0, "shift_ids": [NIGHT], "type": "must_work"},
        {"employee_id": 3, "day_idx": 1, "shift_ids": [MORNING, EVENING, NIGHT], "type": "cannot_work"},
        {"employee_id": 4, "day_idx": 4, "shift_ids": [EVENING], "type": "must_work"},
    ]

    _engine_week_passes(employees, settings=settings, constraints=constraints)
