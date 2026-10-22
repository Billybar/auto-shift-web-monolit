"""Demand per role: the weekly view and date overrides."""
from app.core.models import ShiftDemand
from main import app
from tests.factories import admin_user, default_position, login_as, make_location, make_position, make_shift

SUNDAY = "2026-10-25"


def test_weekly_demand_is_per_role_and_dense(client, db_session):
    location = make_location(db_session)
    general = default_position(location)
    guard = make_position(db_session, location, "מאבטח")
    morning = make_shift(db_session, location)
    db_session.add(ShiftDemand(shift_definition_id=morning.id, day_of_week=0, position_id=guard.id, required_employees=2))
    db_session.commit()
    login_as(app, admin_user())

    response = client.get("/api/shift-definitions/weekly-demand", params={"location_id": location.id, "start_date": SUNDAY})
    app.dependency_overrides.clear()

    cells = response.json()
    assert len(cells) == 7 * 2, "Every date × active role, including zeros"
    sunday_guard = next(c for c in cells if c["position_id"] == guard.id and c["date"] == SUNDAY)
    assert sunday_guard["required_employees"] == 2 and sunday_guard["is_override"] is False
    assert all(c["required_employees"] == 0 for c in cells if c["position_id"] == general.id)


def test_override_per_role_and_reset(client, db_session):
    location = make_location(db_session)
    guard = make_position(db_session, location, "מאבטח")
    morning = make_shift(db_session, location)
    db_session.add(ShiftDemand(shift_definition_id=morning.id, day_of_week=0, position_id=guard.id, required_employees=2))
    db_session.commit()
    login_as(app, admin_user())
    url = f"/api/shift-definitions/{morning.id}/demand-overrides/{SUNDAY}"

    raised = client.put(url, json={"position_id": guard.id, "required_employees": 3})
    weekly = client.get("/api/shift-definitions/weekly-demand", params={"location_id": location.id, "start_date": SUNDAY})
    reset = client.put(url, json={"position_id": guard.id, "required_employees": 2})
    foreign = client.put(url, json={"position_id": 999_999, "required_employees": 1})
    app.dependency_overrides.clear()

    assert raised.json() == {
        "shift_id": morning.id, "position_id": guard.id, "date": SUNDAY, "required_employees": 3, "is_override": True,
    }
    sunday_guard = next(c for c in weekly.json() if c["position_id"] == guard.id and c["date"] == SUNDAY)
    assert sunday_guard["required_employees"] == 3
    assert reset.json()["is_override"] is False, "Back to the template value removes the override"
    assert foreign.status_code == 400 and foreign.json()["code"] == "position_invalid"


def test_old_per_shift_demand_routes_are_gone(client, db_session):
    location = make_location(db_session)
    morning = make_shift(db_session, location)
    db_session.commit()
    login_as(app, admin_user())

    response = client.get(f"/api/shift-definitions/{morning.id}/demands")
    app.dependency_overrides.clear()

    assert response.status_code in (404, 405)
