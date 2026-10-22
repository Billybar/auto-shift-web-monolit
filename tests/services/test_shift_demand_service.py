import datetime

from app.core.models import ShiftDemand, ShiftDemandOverride
from app.services import shift_demand_service
from tests.factories import default_position, make_location, make_position, make_shift

SUNDAY = datetime.date(2026, 10, 25)
SATURDAY = SUNDAY + datetime.timedelta(days=6)


def test_precedence_per_role(db_session):
    """Override, then template, then 0 — independently for each role."""
    location = make_location(db_session)
    general = default_position(location)
    guard = make_position(db_session, location, "מאבטח")
    shift = make_shift(db_session, location)
    db_session.add_all([
        ShiftDemand(shift_definition_id=shift.id, day_of_week=0, position_id=general.id, required_employees=2),
        ShiftDemand(shift_definition_id=shift.id, day_of_week=0, position_id=guard.id, required_employees=1),
        ShiftDemandOverride(shift_definition_id=shift.id, date=SUNDAY, position_id=guard.id, required_employees=4),
    ])
    db_session.flush()

    demand = shift_demand_service.resolve_demand(db_session, location.id, SUNDAY, SATURDAY)

    assert demand[(shift.id, SUNDAY, general.id)] == shift_demand_service.DemandCell(2, False)
    assert demand[(shift.id, SUNDAY, guard.id)] == shift_demand_service.DemandCell(4, True)
    monday = SUNDAY + datetime.timedelta(days=1)
    assert demand[(shift.id, monday, guard.id)] == shift_demand_service.DemandCell(0, False)


def test_dense_and_archived_roles_ignored(db_session):
    location = make_location(db_session)
    archived = make_position(db_session, location, "ישן", is_active=False)
    morning = make_shift(db_session, location)
    evening = make_shift(db_session, location, "ערב", "15:00", "23:00")
    db_session.add(ShiftDemand(shift_definition_id=morning.id, day_of_week=0, position_id=archived.id, required_employees=5))
    db_session.flush()

    demand = shift_demand_service.resolve_demand(db_session, location.id, SUNDAY, SATURDAY)

    assert len(demand) == 2 * 7, "2 shifts × 1 active role × 7 dates"
    assert all(p != archived.id for (_, _, p) in demand)
    assert all(cell.required == 0 for cell in demand.values())


def test_replace_template_diffs_active_roles_only(db_session):
    location = make_location(db_session)
    general = default_position(location)
    archived = make_position(db_session, location, "ישן", is_active=False)
    shift = make_shift(db_session, location)
    kept = ShiftDemand(shift_definition_id=shift.id, day_of_week=0, position_id=general.id, required_employees=1)
    db_session.add_all([
        kept,
        ShiftDemand(shift_definition_id=shift.id, day_of_week=1, position_id=general.id, required_employees=1),
        ShiftDemand(shift_definition_id=shift.id, day_of_week=0, position_id=archived.id, required_employees=3),
    ])
    db_session.flush()
    kept_id = kept.id

    shift_demand_service.replace_template(db_session, location.id, [
        (shift.id, 0, general.id, 2),  # changed in place
        (shift.id, 2, general.id, 1),  # new
        (shift.id, 3, general.id, 0),  # zero: not stored
    ])  # day 1 left out: removed

    rows = {
        (r.day_of_week, r.position_id): (r.id, r.required_employees)
        for r in db_session.query(ShiftDemand).filter_by(shift_definition_id=shift.id)
    }
    assert rows[(0, general.id)] == (kept_id, 2)
    assert rows[(2, general.id)][1] == 1
    assert (1, general.id) not in rows and (3, general.id) not in rows
    assert rows[(0, archived.id)][1] == 3, "Archived roles keep their template"


def test_override_equal_to_template_is_removed(db_session):
    location = make_location(db_session)
    general = default_position(location)
    shift = make_shift(db_session, location)
    db_session.add(ShiftDemand(shift_definition_id=shift.id, day_of_week=0, position_id=general.id, required_employees=2))
    db_session.flush()

    raised = shift_demand_service.set_demand_override(db_session, shift, general.id, SUNDAY, 3)
    assert raised == shift_demand_service.DemandCell(3, True)
    assert db_session.query(ShiftDemandOverride).count() == 1

    reset = shift_demand_service.set_demand_override(db_session, shift, general.id, SUNDAY, 2)
    assert reset == shift_demand_service.DemandCell(2, False)
    assert db_session.query(ShiftDemandOverride).count() == 0
