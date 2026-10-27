"""Shift definitions (hours, category, order) and demand per role: the weekly view and date overrides."""
from app.core.models import ShiftDefinition, ShiftDemand
from app.services.constraint_group_service import create_group_for
from main import app
from tests.factories import admin_user, default_position, login_as, make_location, make_position, make_shift

SUNDAY = "2026-10-25"


def test_create_normalizes_and_validates_hours(client, db_session):
    location = make_location(db_session)
    db_session.commit()
    login_as(app, admin_user())

    def create(start, end):
        return client.post(
            "/api/shift-definitions/",
            json={"location_id": location.id, "name": "בוקר", "start_time": start, "end_time": end},
        )

    created = create("7:00", "15:00")
    out_of_range = create("25:00", "15:00")
    same_time = create("08:00", "08:00")
    app.dependency_overrides.clear()

    assert created.status_code == 201
    assert (created.json()["start_time"], created.json()["category"]) == ("07:00", "morning")
    assert out_of_range.status_code == 422
    assert same_time.status_code == 422 and same_time.json()["code"] == "shift_invalid_hours"


def test_update_checks_the_merged_hours(client, db_session):
    location = make_location(db_session)
    shift = make_shift(db_session, location, "בוקר", "07:00", "15:00")
    db_session.commit()
    login_as(app, admin_user())

    ends_when_it_starts = client.put(f"/api/shift-definitions/{shift.id}", json={"end_time": "07:00"})
    null_start_is_ignored = client.put(f"/api/shift-definitions/{shift.id}", json={"start_time": None, "end_time": "16:00"})
    app.dependency_overrides.clear()

    assert ends_when_it_starts.status_code == 422 and ends_when_it_starts.json()["code"] == "shift_invalid_hours"
    assert null_start_is_ignored.status_code == 200
    assert (null_start_is_ignored.json()["start_time"], null_start_is_ignored.json()["end_time"]) == ("07:00", "16:00")


def test_list_follows_the_work_day_with_categories(client, db_session):
    """Morning, evening, then the 00:00 night (the night after its day); a row with invalid hours is still listed, last."""
    location = make_location(db_session)
    night = make_shift(db_session, location, "לילה", "00:00", "08:00")
    legacy = ShiftDefinition(location_id=location.id, name="ישן", start_time="abc", end_time="15:00")
    create_group_for(legacy)
    db_session.add(legacy)
    evening = make_shift(db_session, location, "ערב", "16:00", "00:00")
    morning = make_shift(db_session, location, "בוקר", "08:00", "16:00")
    db_session.commit()
    login_as(app, admin_user())

    response = client.get("/api/shift-definitions/", params={"location_id": location.id})
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert [(s["id"], s["category"]) for s in response.json()] == [
        (morning.id, "morning"), (evening.id, "evening"), (night.id, "night"), (legacy.id, None),
    ]


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
