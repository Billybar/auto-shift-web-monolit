import datetime

import pytest

from app.core.models import Assignment, ShiftDemand, WeeklyConstraint
from app.core.enums import ConstraintType, ErrorCode
from app.core.errors import AppError
from app.services.weekly_schedule_service import calculate_historical_states, generate_weekly_schedule
from tests.factories import default_position, make_employee, make_location, make_position, make_shift

SUNDAY = datetime.date(2026, 10, 25)
FRIDAY, SATURDAY = SUNDAY - datetime.timedelta(days=2), SUNDAY - datetime.timedelta(days=1)


def _worked(db, location, employee, shift, on_date):
    db.add(Assignment(
        location_id=location.id, employee_id=employee.id, shift_id=shift.id, date=on_date,
        position_id=default_position(location).id,
    ))


def test_single_role_location_matches_the_pre_roles_penalty(db_session):
    """
    The scenario of test_target_shifts_penalty, run end to end through the DB: a single-role
    location must produce the same penalty as before roles existed (200).
    """
    location = make_location(db_session)
    location.weights.target_shifts = 40
    general = default_position(location)
    morning = make_shift(db_session, location)
    first = make_employee(db_session, location, [general], general, target_shifts=3)
    make_employee(db_session, location, [general], general, target_shifts=3)
    for day in range(5):
        db_session.add(ShiftDemand(shift_definition_id=morning.id, day_of_week=day, position_id=general.id, required_employees=1))
        db_session.add(WeeklyConstraint(
            employee_id=first.id, shift_id=morning.id,
            date=SUNDAY + datetime.timedelta(days=day), constraint_type=ConstraintType.MUST_WORK,
        ))
    db_session.flush()

    result = generate_weekly_schedule(db_session, location.id, SUNDAY)

    # Emp 1: 5 shifts vs target 3 -> 2 × 40; Emp 2: 0 vs 3 -> 3 × 40; plus the default
    # min_mornings weight would only apply with a min_mornings setting, which is unset
    assert result.status == "OPTIMAL"
    assert result.penalty_score == 200
    assert result.unfilled_slots == [] and result.warnings == []
    assert all(a.position_id == general.id for a in result.draft_assignments)


def test_warnings_and_unfilled_slots_are_mapped_to_dates(db_session):
    location = make_location(db_session)
    general = default_position(location)
    guard = make_position(db_session, location, "מאבטח")
    morning = make_shift(db_session, location)
    holder = make_employee(db_session, location, [general], general)
    no_roles = make_employee(db_session, location)
    db_session.add(ShiftDemand(shift_definition_id=morning.id, day_of_week=0, position_id=guard.id, required_employees=1))
    db_session.add(WeeklyConstraint(
        employee_id=holder.id, shift_id=morning.id, date=SUNDAY, constraint_type=ConstraintType.MUST_WORK,
    ))
    db_session.flush()

    result = generate_weekly_schedule(db_session, location.id, SUNDAY)

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert [(u.shift_id, u.position_id, u.date, u.missing) for u in result.unfilled_slots] == [
        (morning.id, guard.id, SUNDAY, 1)
    ]
    codes = {(w.code, w.employee_id) for w in result.warnings}
    assert ("employee_skipped_no_positions", no_roles.id) in codes
    assert ("must_work_ignored", holder.id) in codes


def test_history_reads_the_hours_not_the_names(db_session):
    """
    The carryover comes from the shifts' hours: names without 'לילה' or 'ערב' work the same.
    Times are minutes from Sunday 00:00, so Saturday 23:00-07:00 ends at +420.
    """
    location = make_location(db_session)
    general = default_position(location)
    morning = make_shift(db_session, location, "א", "07:00", "15:00")
    evening = make_shift(db_session, location, "ב", "15:00", "23:00")
    night = make_shift(db_session, location, "ג", "23:00", "07:00")
    after_midnight = make_shift(db_session, location, "ד", "00:00", "08:00")
    nights, late, mornings, midnight = (make_employee(db_session, location, [general], general) for _ in range(4))
    _worked(db_session, location, nights, night, FRIDAY)
    _worked(db_session, location, nights, night, SATURDAY)
    _worked(db_session, location, late, evening, SATURDAY)
    for days_before in (3, 2, 1):
        _worked(db_session, location, mornings, morning, SUNDAY - datetime.timedelta(days=days_before))
    # Saturday's 00:00 shift is the night after Saturday: it ends Sunday 08:00
    _worked(db_session, location, midnight, after_midnight, SATURDAY)
    db_session.flush()

    states = calculate_historical_states(db_session, location.id, SUNDAY)

    def summary(employee):
        state = states[employee.id]
        return state.history_streak, state.trailing_nights, state.last_shift_end

    assert summary(nights) == (2, 2, 7 * 60)
    assert summary(late) == (1, 0, -60)
    assert summary(mornings) == (3, 0, -24 * 60 + 15 * 60)
    assert summary(midnight) == (1, 1, 8 * 60)


def test_saturday_night_blocks_sunday_morning(db_session):
    """End to end: last Saturday's night shift ends Sunday 07:00, so Sunday's 07:00 morning goes to someone else."""
    location = make_location(db_session)
    general = default_position(location)
    morning = make_shift(db_session, location, "בוקר", "07:00", "15:00")
    night = make_shift(db_session, location, "לילה", "23:00", "07:00")
    tired = make_employee(db_session, location, [general], general)
    rested = make_employee(db_session, location, [general], general)
    _worked(db_session, location, tired, night, SATURDAY)
    db_session.add(ShiftDemand(shift_definition_id=morning.id, day_of_week=0, position_id=general.id, required_employees=1))
    db_session.flush()

    result = generate_weekly_schedule(db_session, location.id, SUNDAY)

    assert result.unfilled_slots == []
    assert [(a.employee_id, a.shift_id, a.date) for a in result.draft_assignments] == [(rested.id, morning.id, SUNDAY)]


def test_invalid_shift_hours_stop_auto_assign(db_session):
    """A shift that starts when it ends has no hours the rules can read: a 409 naming it, not a guess."""
    location = make_location(db_session)
    general = default_position(location)
    broken = make_shift(db_session, location, "משמרת", "08:00", "08:00")
    make_employee(db_session, location, [general], general)
    db_session.flush()

    with pytest.raises(AppError) as raised:
        generate_weekly_schedule(db_session, location.id, SUNDAY)

    assert raised.value.code == ErrorCode.SHIFT_INVALID_HOURS
    assert raised.value.status_code == 409
    assert raised.value.params == {"shift_id": broken.id, "shift_name": "משמרת"}
