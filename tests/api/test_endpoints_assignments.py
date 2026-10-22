# tests/test_endpoints_assignments.py

import datetime
from app.api.dependencies import get_current_user, get_current_admin_user, get_current_scheduler_user
from app.core.models import User, Organization, Client, Location, Employee, ShiftDefinition, Assignment
from main import app
import pytest
from sqlalchemy.exc import IntegrityError
from app.core.models import ShiftDemand
from tests.factories import admin_user, default_position, login_as, make_employee, make_location, make_position, make_shift


# --- Authorization Mocks ---

def override_get_current_user():
    """Simulates a logged-in regular employee."""
    return User(id=1, username="employee_test", role="employee")


def override_get_current_admin_user():
    """Simulates a logged-in admin user."""
    return User(id=2, username="admin_test", role="admin")


# --- Helper Setup Function ---

def setup_assignment_dependencies(db_session):
    """
    Creates the required hierarchy (Org -> Client -> Location -> Employee + Shift)
    so we can test assignment creation properly.
    Returns location_id, employee_id, and shift_id.
    """
    org = Organization(name="Assignment Org")
    db_session.add(org)
    db_session.flush()

    client_db = Client(name="Assignment Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.flush()

    location = Location(name="Assignment Loc", client_id=client_db.id)
    db_session.add(location)
    db_session.flush()

    emp = Employee(name="Assignment Worker", location_id=location.id)
    db_session.add(emp)
    db_session.flush()

    shift = ShiftDefinition(location_id=location.id, shift_name="Morning")
    db_session.add(shift)
    db_session.commit()

    return location.id, emp.id, shift.id


# --- Tests ---

def test_read_assignments_unauthorized(client):
    """
    Ensure unauthorized access to read assignments is blocked.
    """
    response = client.get("/assignments/?location_id=1&start_date=2023-01-01&end_date=2023-01-07")
    assert response.status_code == 401


def test_read_assignments_as_employee(client, db_session):
    """
    Ensure a logged-in regular user can retrieve the schedule for a given date range.
    """
    app.dependency_overrides[get_current_user] = override_get_current_user

    loc_id, emp_id, shift_id = setup_assignment_dependencies(db_session)
    test_date = datetime.date(2023, 10, 1)

    # Insert a manual assignment into the DB
    assignment = Assignment(
        location_id=loc_id,
        employee_id=emp_id,
        shift_id=shift_id,
        date=test_date
    )
    db_session.add(assignment)
    db_session.commit()

    # Request assignments for that week
    response = client.get(
        f"/assignments/?location_id={loc_id}&start_date=2023-10-01&end_date=2023-10-07"
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["employee_id"] == emp_id
    assert data[0]["date"] == str(test_date)


def test_sync_assignments_forbidden_for_employee(client, db_session):
    """
    Ensure regular employees CANNOT save/sync the schedule (Admin only).
    """
    app.dependency_overrides[get_current_user] = override_get_current_user

    # Trying to POST to the assignments endpoint as a regular user
    response = client.post(
        "/assignments/?location_id=1&start_date=2023-10-01&end_date=2023-10-07",
        json=[]
    )

    app.dependency_overrides.clear()

    # Because our override only covers `get_current_user` and not `get_current_admin_user`,
    # the admin dependency will fail and return 401 (or 403 depending on implementation).
    assert response.status_code in [401, 403]


def test_sync_weekly_assignments_smart_sync_logic(client, db_session):
    """
    Test the Smart Sync logic:
    1. Keep existing assignments that are in the payload.
    2. Add new assignments.
    3. Delete assignments that are in the DB but missing from the payload.
    """
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user

    loc_id, emp_id, shift_id = setup_assignment_dependencies(db_session)

    date_sunday = datetime.date(2023, 10, 1)
    date_monday = datetime.date(2023, 10, 2)
    date_tuesday = datetime.date(2023, 10, 3)

    # Step 1: Seed the database with two assignments (Sunday and Monday)
    assignment_sun = Assignment(location_id=loc_id, employee_id=emp_id, shift_id=shift_id, date=date_sunday)
    assignment_mon = Assignment(location_id=loc_id, employee_id=emp_id, shift_id=shift_id, date=date_monday)
    db_session.add_all([assignment_sun, assignment_mon])
    db_session.commit()

    # Step 2: Prepare the incoming payload from the "Frontend"
    # We will KEEP Sunday, REMOVE Monday (by omitting it), and ADD Tuesday.
    payload = [
        {"employee_id": emp_id, "shift_id": shift_id, "date": str(date_sunday)},  # Existing (Keep)
        {"employee_id": emp_id, "shift_id": shift_id, "date": str(date_tuesday)}  # New (Add)
    ]

    # Step 3: Call the Sync Endpoint
    response = client.post(
        f"/assignments/?location_id={loc_id}&start_date=2023-10-01&end_date=2023-10-07",
        json=payload
    )

    app.dependency_overrides.clear()

    # Step 4: Validate the API response stats
    assert response.status_code == 200
    data = response.json()
    assert data["added"] == 1  # Tuesday added
    assert data["removed"] == 1  # Monday removed
    assert data["unchanged"] == 1  # Sunday kept

    # Step 5: Validate the actual Database state
    final_assignments = db_session.query(Assignment).filter(Assignment.location_id == loc_id).all()
    assert len(final_assignments) == 2

    dates_in_db = [a.date for a in final_assignments]
    assert date_sunday in dates_in_db
    assert date_tuesday in dates_in_db
    assert date_monday not in dates_in_db  # Monday should be gone

def override_get_current_scheduler_admin():
    """Simulates a logged-in admin passing the scheduler guard (admins skip the location scope check)."""
    return User(id=3, email="engine_admin@test.com", role="admin", employee_id=None)


def test_auto_generate_without_active_employees_returns_error_code(client, db_session):
    """
    Running the engine for a location with no active employees fails with a machine-readable code
    (instead of an unhandled ValueError / 500), and `detail` stays a plain string.
    """
    app.dependency_overrides[get_current_scheduler_user] = override_get_current_scheduler_admin

    org = Organization(name="Engine Org")
    db_session.add(org)
    db_session.flush()
    client_db = Client(name="Engine Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.flush()
    location = Location(name="Engine Loc", client_id=client_db.id)
    db_session.add(location)
    db_session.flush()
    db_session.add(Employee(location_id=location.id, is_active=False))
    db_session.commit()

    response = client.post(
        f"/api/assignments/auto-generate/{location.id}",
        params={"start_date": "2026-10-25"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "schedule_no_active_employees"
    assert isinstance(body["detail"], str)


# ==========================================
# Roles (positions) in Smart Sync
# ==========================================


SUNDAY = datetime.date(2026, 10, 25)
WEEK = {"start_date": "2026-10-25", "end_date": "2026-10-31"}


@pytest.fixture
def role_site(db_session):
    """A site needing 1 supervisor + 1 guard on Sunday morning; employee 'both' holds both roles."""
    location = make_location(db_session)
    supervisor = default_position(location)
    guard = make_position(db_session, location, "מאבטח")
    morning = make_shift(db_session, location)
    for position in (supervisor, guard):
        db_session.add(ShiftDemand(shift_definition_id=morning.id, day_of_week=0, position_id=position.id, required_employees=1))
    only_guard = make_employee(db_session, location, [guard], primary=guard)
    both = make_employee(db_session, location, [supervisor, guard], primary=guard)
    db_session.commit()
    return location, supervisor, guard, morning, only_guard, both


def _sync(client, location_id, rows):
    return client.post("/api/assignments/", params={"location_id": location_id, **WEEK}, json=rows)


def test_omitted_role_is_kept_for_existing_rows(client, db_session, role_site):
    location, supervisor, guard, morning, only_guard, both = role_site
    row = Assignment(location_id=location.id, employee_id=both.id, shift_id=morning.id, date=SUNDAY, position_id=supervisor.id)
    db_session.add(row)
    db_session.commit()
    login_as(app, admin_user())

    # An installed mobile build re-sends the row without a role
    response = _sync(client, location.id, [{"employee_id": both.id, "shift_id": morning.id, "date": str(SUNDAY)}])
    app.dependency_overrides.clear()

    assert response.json() == {"added": 0, "updated": 0, "removed": 0, "unchanged": 1}
    db_session.refresh(row)
    assert row.position_id == supervisor.id


def test_omitted_role_is_inferred_from_the_open_gap(client, db_session, role_site):
    """
    Old mobile build replaces the supervisor: the guard slot is taken, so the replacement (who holds
    both roles, primary guard) fills the open supervisor slot rather than their primary role.
    """
    location, supervisor, guard, morning, only_guard, both = role_site
    db_session.add(Assignment(location_id=location.id, employee_id=only_guard.id, shift_id=morning.id, date=SUNDAY, position_id=guard.id))
    db_session.commit()
    login_as(app, admin_user())

    response = _sync(client, location.id, [
        {"employee_id": only_guard.id, "shift_id": morning.id, "date": str(SUNDAY)},
        {"employee_id": both.id, "shift_id": morning.id, "date": str(SUNDAY)},
    ])
    app.dependency_overrides.clear()

    assert response.status_code == 200
    rows = {a.employee_id: a.position_id for a in db_session.query(Assignment).filter_by(location_id=location.id)}
    assert rows == {only_guard.id: guard.id, both.id: supervisor.id}


def test_inference_falls_back_to_primary(client, db_session, role_site):
    """No open slot on Monday (no demand): the primary role is used."""
    location, supervisor, guard, morning, only_guard, both = role_site
    login_as(app, admin_user())

    response = _sync(client, location.id, [{"employee_id": both.id, "shift_id": morning.id, "date": "2026-10-26"}])
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert db_session.query(Assignment).filter_by(employee_id=both.id).one().position_id == guard.id


def test_employee_without_roles_cannot_get_an_inferred_role(client, db_session, role_site):
    location, supervisor, guard, morning, only_guard, both = role_site
    no_roles = make_employee(db_session, location)
    db_session.commit()
    login_as(app, admin_user())

    response = _sync(client, location.id, [{"employee_id": no_roles.id, "shift_id": morning.id, "date": str(SUNDAY)}])
    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json()["code"] == "employee_has_no_positions"


def test_role_change_keeps_the_row_id(client, db_session, role_site):
    location, supervisor, guard, morning, only_guard, both = role_site
    row = Assignment(location_id=location.id, employee_id=both.id, shift_id=morning.id, date=SUNDAY, position_id=guard.id)
    db_session.add(row)
    db_session.commit()
    row_id = row.id
    login_as(app, admin_user())

    response = _sync(client, location.id, [
        {"employee_id": both.id, "shift_id": morning.id, "date": str(SUNDAY), "position_id": supervisor.id},
    ])
    app.dependency_overrides.clear()

    assert response.json() == {"added": 0, "updated": 1, "removed": 0, "unchanged": 0}
    stored = db_session.query(Assignment).filter_by(employee_id=both.id).one()
    assert (stored.id, stored.position_id) == (row_id, supervisor.id)


def test_manual_role_the_employee_does_not_hold_is_allowed(client, db_session, role_site):
    location, supervisor, guard, morning, only_guard, both = role_site
    login_as(app, admin_user())

    response = _sync(client, location.id, [
        {"employee_id": only_guard.id, "shift_id": morning.id, "date": str(SUNDAY), "position_id": supervisor.id},
    ])
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert db_session.query(Assignment).filter_by(employee_id=only_guard.id).one().position_id == supervisor.id


def test_duplicate_and_out_of_range_rows_return_422(client, db_session, role_site):
    location, supervisor, guard, morning, only_guard, both = role_site
    login_as(app, admin_user())

    row = {"employee_id": both.id, "shift_id": morning.id, "date": str(SUNDAY), "position_id": guard.id}
    duplicate = _sync(client, location.id, [row, {**row, "position_id": supervisor.id}])
    out_of_range = _sync(client, location.id, [{**row, "date": "2026-11-01"}])
    app.dependency_overrides.clear()

    assert duplicate.status_code == 422
    assert out_of_range.status_code == 422
    assert db_session.query(Assignment).count() == 0


def test_rows_of_another_location_are_rejected(client, db_session, role_site):
    location, supervisor, guard, morning, only_guard, both = role_site
    other = make_location(db_session, "Other")
    other_shift = make_shift(db_session, other)
    stranger = make_employee(db_session, other, [default_position(other)], default_position(other))
    db_session.commit()
    login_as(app, admin_user())

    base = {"employee_id": both.id, "shift_id": morning.id, "date": str(SUNDAY), "position_id": guard.id}
    responses = [
        _sync(client, location.id, [{**base, "employee_id": stranger.id}]),
        _sync(client, location.id, [{**base, "shift_id": other_shift.id}]),
        _sync(client, location.id, [{**base, "position_id": default_position(other).id}]),
    ]
    app.dependency_overrides.clear()

    assert [r.status_code for r in responses] == [422, 422, 422]


def test_concurrent_edit_returns_409(client, db_session, role_site, monkeypatch):
    location, supervisor, guard, morning, only_guard, both = role_site
    login_as(app, admin_user())

    def conflicting_commit():
        raise IntegrityError("INSERT INTO assignments", {}, Exception("duplicate key"))

    monkeypatch.setattr(db_session, "commit", conflicting_commit)
    response = _sync(client, location.id, [
        {"employee_id": both.id, "shift_id": morning.id, "date": str(SUNDAY), "position_id": guard.id},
    ])
    monkeypatch.undo()
    app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.json()["code"] == "schedule_concurrent_edit"


def test_auto_generate_returns_roles_and_unfilled_slots(client, db_session, role_site):
    """Two people, but only 'both' can supervise: both slots are filled with the right roles."""
    location, supervisor, guard, morning, only_guard, both = role_site
    login_as(app, admin_user())

    response = client.post(f"/api/assignments/auto-generate/{location.id}", params={"start_date": str(SUNDAY)})
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["status"] in ("OPTIMAL", "FEASIBLE")
    assert {(a["employee_id"], a["position_id"]) for a in body["draft_assignments"]} == {
        (only_guard.id, guard.id), (both.id, supervisor.id),
    }
    assert body["unfilled_slots"] == []
    assert body["warnings"] == []


def test_auto_generate_with_nobody_staffable_returns_error_code(client, db_session):
    location = make_location(db_session)
    make_position(db_session, location, "מאבטח")
    make_employee(db_session, location)  # active, but holds no role
    db_session.commit()
    login_as(app, admin_user())

    response = client.post(f"/api/assignments/auto-generate/{location.id}", params={"start_date": str(SUNDAY)})
    app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.json()["code"] == "schedule_no_staffable_employees"
