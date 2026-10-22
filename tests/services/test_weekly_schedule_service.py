import datetime

from app.core.models import ShiftDemand, WeeklyConstraint
from app.core.enums import ConstraintType
from app.services.weekly_schedule_service import generate_weekly_schedule
from tests.factories import default_position, make_employee, make_location, make_position, make_shift

SUNDAY = datetime.date(2026, 10, 25)


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
