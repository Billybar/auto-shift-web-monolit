import pytest

from app.core import shift_timing
from app.core.enums import ShiftCategory
from app.core.models import ShiftDefinition
from tests.engine.helpers import shift

MORNING, EVENING, NIGHT = ShiftCategory.MORNING, ShiftCategory.EVENING, ShiftCategory.NIGHT


@pytest.mark.parametrize("value, minutes", [
    ("07:00", 420), ("7:00", 420), ("07:00:30", 420), (" 07:00 ", 420), ("00:00", 0), ("23:59", 1439), ("24:00", 0),
])
def test_parse_clock(value, minutes):
    assert shift_timing.parse_clock(value) == minutes


@pytest.mark.parametrize("value", [None, 7, "", "7", "abc", "25:00", "24:30", "07:60", "07:00 am", "7.00"])
def test_parse_clock_rejects_anything_else(value):
    with pytest.raises(ValueError):
        shift_timing.parse_clock(value)


def test_normalize_clock():
    assert shift_timing.normalize_clock("7:00") == "07:00"
    assert shift_timing.normalize_clock("07:00:30") == "07:00"
    assert shift_timing.normalize_clock("24:00") == "00:00"
    assert shift_timing.normalize_clock(None) is None, "Non-strings are left for the type validation"
    with pytest.raises(ValueError, match="HH:MM"):
        shift_timing.normalize_clock("25:00")


@pytest.mark.parametrize("start, category", [
    ("03:59", NIGHT), ("04:00", MORNING), ("11:59", MORNING), ("12:00", EVENING),
    ("20:59", EVENING), ("21:00", NIGHT), ("00:00", NIGHT),
])
def test_category_by_start_time(start, category):
    assert shift_timing.timing_of(shift(1, start, "23:59")).category == category


def test_start_before_4am_is_the_night_after_its_day():
    midnight = shift_timing.timing_of(shift(1, "00:00", "08:00"))
    late = shift_timing.timing_of(shift(2, "03:59", "05:00"))

    assert (midnight.start, midnight.end) == (24 * 60, 32 * 60)
    assert late.start == 24 * 60 + 3 * 60 + 59


@pytest.mark.parametrize("start, end, duration", [
    ("07:00", "15:00", 480), ("23:00", "07:00", 480), ("22:00", "06:00", 480), ("16:00", "00:00", 480), ("07:00", "06:59", 1439),
])
def test_duration_wraps_midnight(start, end, duration):
    assert shift_timing.timing_of(shift(1, start, end)).duration == duration


@pytest.mark.parametrize("start, end", [("08:00", "08:00"), ("7:00", "07:00"), (None, "15:00"), ("abc", "15:00"), ("07:00", "")])
def test_invalid_hours(start, end):
    bad = ShiftDefinition(id=9, name="בוקר", start_time=start, end_time=end)

    with pytest.raises(shift_timing.InvalidShiftHours) as raised:
        shift_timing.timing_of(bad)
    assert (raised.value.shift_id, raised.value.shift_name) == (9, "בוקר")
    assert shift_timing.try_timing(bad) is None


def test_build_timings_raises_on_an_invalid_shift():
    with pytest.raises(shift_timing.InvalidShiftHours) as raised:
        shift_timing.build_timings([shift(1, "07:00", "15:00"), shift(2, "15:00", "15:00")])
    assert raised.value.shift_id == 2


def _rules(*shifts):
    rules = shift_timing.rest_rules(shift_timing.build_timings(shifts).values())
    return set(rules.hard), set(rules.soft)


def test_rest_rules_three_shifts():
    """Night then morning is forbidden; evening then morning and night then evening are penalized."""
    hard, soft = _rules(shift(1, "07:00", "15:00"), shift(2, "15:00", "23:00"), shift(3, "23:00", "07:00"))

    assert hard == {(3, 1, 1)}
    assert soft == {(2, 1, 1), (3, 2, 1)}


def test_rest_rules_two_shifts():
    """Evening then morning is 8 hours: penalized, not forbidden."""
    hard, soft = _rules(shift(1, "07:00", "15:00"), shift(2, "15:00", "23:00"))

    assert hard == set()
    assert soft == {(2, 1, 1)}


def test_rest_rules_four_shifts():
    """Two morning shifts: the evening is 7 hours before the 06:00 one and 8 hours before the 07:00 one."""
    hard, soft = _rules(
        shift(1, "06:00", "14:00"), shift(2, "07:00", "15:00"), shift(3, "15:00", "23:00"), shift(4, "23:00", "07:00"),
    )

    assert hard == {(3, 1, 1), (4, 1, 1), (4, 2, 1)}
    assert soft == {(3, 2, 1), (4, 3, 1)}


def test_rest_rules_twelve_hour_shifts():
    """07-19 and 19-07: only night then day is forbidden; the 19:00 shift is an evening by the 21:00 rule."""
    timings = shift_timing.build_timings([shift(1, "07:00", "19:00"), shift(2, "19:00", "07:00")])
    hard, soft = _rules(shift(1, "07:00", "19:00"), shift(2, "19:00", "07:00"))

    assert hard == {(2, 1, 1)} and soft == set()
    assert (timings[1].category, timings[2].category) == (MORNING, EVENING)


def test_rest_rules_reach_two_days_ahead_for_long_shifts():
    """A 23-hour shift from 03:00 (the night after its day) ends at 02:00 two days on, 2 hours before a 04:00 start."""
    hard, _ = _rules(shift(1, "03:00", "02:00"), shift(2, "04:00", "12:00"))

    assert (1, 2, 2) in hard


def test_rest_rules_of_no_shifts():
    assert shift_timing.rest_rules([]) == shift_timing.RestRules()


def test_display_key_follows_the_work_day():
    shifts = [
        shift(1, "00:00", "08:00"),
        shift(2, "08:00", "16:00"),
        ShiftDefinition(id=3, name="legacy", start_time="abc", end_time="15:00"),
        shift(4, "16:00", "00:00"),
    ]

    assert [s.id for s in sorted(shifts, key=shift_timing.display_key)] == [2, 4, 1, 3]
