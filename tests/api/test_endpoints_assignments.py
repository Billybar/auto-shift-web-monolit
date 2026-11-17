# tests/test_endpoints_assignments.py

import datetime
from app.api.dependencies import get_current_user, get_current_admin_user, get_current_scheduler_user
from app.core.models import User, Organization, Client, Location, Employee, ShiftDefinition, Assignment, ScheduleWeek 
from main import app
import pytest
from sqlalchemy.exc import IntegrityError
from app.core.models import ShiftDemand
from tests.factories import admin_user, default_position, login_as, make_employee, make_location, make_position, make_shift, scheduler_user, employee_user 


# --- Fixtures and helpers ---

@pytest.fixture
def site(db_session):
    """One location with one shift and one employee who holds the default role."""
    location = make_location(db_session)
    role = default_position(location)
    shift = make_shift(db_session, location)
    employee = make_employee(db_session, location, [role], primary=role)
    db_session.commit()
    return location, employee, shift, role


# --- Tests ---

def test_read_assignments_unauthorized(client):
    """No token, no schedule."""
    response = client.get("/api/assignments/?location_id=1&start_date=2023-01-01&end_date=2023-01-07")
    assert response.status_code == 401


def test_read_assignments_as_employee(client, db_session, site):
    """An employee sees the assignments of their own location in a published week."""
    location, employee, shift, role = site
    sunday = datetime.date(2023, 10, 1)
    db_session.add(Assignment(
        location_id=location.id, employee_id=employee.id, shift_id=shift.id, date=sunday, position_id=role.id,
    ))
    db_session.add(ScheduleWeek(location_id=location.id, week_start_date=sunday, is_published=True))
    db_session.commit()
    user = employee_user(db_session, employee)
    app.dependency_overrides[get_current_user] = lambda: user

    response = client.get(
        "/api/assignments/", params={"location_id": location.id, "start_date": "2023-10-01", "end_date": "2023-10-07"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["employee_id"] == employee.id
    assert data[0]["date"] == str(sunday)


def test_employee_does_not_see_draft_weeks(client, db_session, site):
    """The same assignment in a week that was never published is hidden from employees."""
    location, employee, shift, role = site
    db_session.add(Assignment(
        location_id=location.id, employee_id=employee.id, shift_id=shift.id,
        date=datetime.date(2023, 10, 1), position_id=role.id,
    ))
    db_session.commit()
    user = employee_user(db_session, employee)
    app.dependency_overrides[get_current_user] = lambda: user

    response = client.get(
        "/api/assignments/", params={"location_id": location.id, "start_date": "2023-10-01", "end_date": "2023-10-07"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == []


def test_sync_assignments_forbidden_for_employee(client, db_session, site):
    """Employees cannot save the schedule (scheduler and above only)."""
    location, employee, shift, role = site
    user = employee_user(db_session, employee)
    app.dependency_overrides[get_current_user] = lambda: user

    response = client.post(
        "/api/assignments/",
        params={"location_id": location.id, "start_date": "2023-10-01", "end_date": "2023-10-07"},
        json=[],
    )
    app.dependency_overrides.clear()

    assert response.status_code == 403


def test_sync_weekly_assignments_smart_sync_logic(client, db_session, site):
    """Smart Sync: keep what is in the payload, add what is new, delete what the payload omits."""
    location, employee, shift, role = site
    sunday = datetime.date(2023, 10, 1)
    monday = datetime.date(2023, 10, 2)
    tuesday = datetime.date(2023, 10, 3)
    db_session.add_all([
        Assignment(location_id=location.id, employee_id=employee.id, shift_id=shift.id, date=day, position_id=role.id)
        for day in (sunday, monday)
    ])
    db_session.commit()
    login_as(app, admin_user())

    # Keep Sunday, drop Monday (by omitting it), add Tuesday
    response = client.post(
        "/api/assignments/",
        params={"location_id": location.id, "start_date": "2023-10-01", "end_date": "2023-10-07"},
        json=[
            {"employee_id": employee.id, "shift_id": shift.id, "date": str(sunday)},
            {"employee_id": employee.id, "shift_id": shift.id, "date": str(tuesday)},
        ],
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"added": 1, "updated": 0, "removed": 1, "unchanged": 1}
    dates_in_db = {a.date for a in db_session.query(Assignment).filter_by(location_id=location.id)}
    assert dates_in_db == {sunday, tuesday}


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


# ==========================================
# Schedule check
# ==========================================


def _check(client, location_id, rows):
    return client.post(f"/api/assignments/check/{location_id}", params={"start_date": str(SUNDAY)}, json=rows)


def test_check_returns_the_broken_rules(client, db_session, role_site):
    """A night, then the next morning, in a role the employee doesn't hold."""
    location, supervisor, guard, morning, only_guard, both = role_site
    night = make_shift(db_session, location, "לילה", "23:00", "07:00")
    db_session.commit()
    login_as(app, admin_user())

    response = _check(client, location.id, [
        {"employee_id": only_guard.id, "shift_id": night.id, "date": "2026-10-25", "position_id": guard.id},
        {"employee_id": only_guard.id, "shift_id": morning.id, "date": "2026-10-26", "position_id": supervisor.id},
    ])
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    by_code = {v["code"]: v for v in body["violations"]}
    assert set(by_code) == {"short_rest", "position_not_held"}
    assert by_code["short_rest"]["rest_minutes"] == 0
    assert by_code["short_rest"]["cells"] == [
        {"shift_id": night.id, "date": "2026-10-25"}, {"shift_id": morning.id, "date": "2026-10-26"},
    ]
    assert by_code["position_not_held"]["position_id"] == supervisor.id
    assert by_code["position_not_held"]["date"] == "2026-10-26"
    # Nothing is saved
    assert db_session.query(Assignment).count() == 0


def test_check_uses_the_edited_hours(client, db_session, role_site):
    location, supervisor, guard, morning, only_guard, both = role_site
    night = make_shift(db_session, location, "לילה", "23:00", "07:00")
    db_session.commit()
    login_as(app, admin_user())

    response = _check(client, location.id, [
        # Moved to 22:00-23:00: 8 hours before the next morning
        {"employee_id": only_guard.id, "shift_id": night.id, "date": "2026-10-25", "position_id": guard.id,
         "start_time": "22:00", "end_time": "23:00"},
        {"employee_id": only_guard.id, "shift_id": morning.id, "date": "2026-10-26", "position_id": guard.id},
    ])
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["violations"] == []


def test_check_counts_the_previous_week(client, db_session, role_site):
    """Saturday night of last week ends Sunday 07:00, when the Sunday morning starts."""
    location, supervisor, guard, morning, only_guard, both = role_site
    night = make_shift(db_session, location, "לילה", "23:00", "07:00")
    db_session.add(Assignment(
        location_id=location.id, employee_id=only_guard.id, shift_id=night.id,
        date=SUNDAY - datetime.timedelta(days=1), position_id=guard.id,
    ))
    db_session.commit()
    login_as(app, admin_user())

    response = _check(client, location.id, [
        {"employee_id": only_guard.id, "shift_id": morning.id, "date": str(SUNDAY), "position_id": guard.id},
    ])
    app.dependency_overrides.clear()

    violations = response.json()["violations"]
    assert [v["code"] for v in violations] == ["short_rest"]
    assert violations[0]["from_previous_week"] is True


def test_check_clean_board(client, db_session, role_site):
    location, supervisor, guard, morning, only_guard, both = role_site
    login_as(app, admin_user())

    response = _check(client, location.id, [
        {"employee_id": only_guard.id, "shift_id": morning.id, "date": str(SUNDAY), "position_id": guard.id},
        {"employee_id": both.id, "shift_id": morning.id, "date": str(SUNDAY), "position_id": supervisor.id},
    ])
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"violations": []}


def test_check_rejects_rows_outside_the_week(client, db_session, role_site):
    location, supervisor, guard, morning, only_guard, both = role_site
    login_as(app, admin_user())

    response = _check(client, location.id, [
        {"employee_id": both.id, "shift_id": morning.id, "date": "2026-11-01", "position_id": guard.id},
    ])
    app.dependency_overrides.clear()

    assert response.status_code == 422


def test_check_is_forbidden_for_employees(client, db_session, role_site):
    location = role_site[0]
    app.dependency_overrides[get_current_user] = lambda: User(id=902, email="employee@test.com", role="employee")

    response = _check(client, location.id, [])
    app.dependency_overrides.clear()

    assert response.status_code == 403


def test_check_of_a_location_out_of_scope_returns_404(client, db_session, role_site):
    location = role_site[0]
    login_as(app, scheduler_user([]))

    response = _check(client, location.id, [])
    app.dependency_overrides.clear()

    assert response.status_code == 404


def test_publishing_freezes_the_employees_default_constraints(client, db_session, role_site):
    """A published week keeps the marks it showed, even when the defaults change afterwards."""
    from app.core.enums import ConstraintType
    from app.core.models import EmployeeDefaultConstraint, WeeklyConstraint, WeeklyNote
    from sqlalchemy import select

    location, supervisor, guard, morning, only_guard, both = role_site
    today = datetime.date.today()
    week = today + datetime.timedelta(days=7 - (today.weekday() + 1) % 7)
    db_session.add(EmployeeDefaultConstraint(
        employee_id=only_guard.id, group_id=morning.constraint_group_id, day_of_week=0,
        constraint_type=ConstraintType.CANNOT_WORK,
    ))
    # The week records who published it, so the admin must be a stored user
    publisher = User(email="publisher@test.com", first_name="P", last_name="U", hashed_password="x", role="admin")
    db_session.add(publisher)
    db_session.commit()
    login_as(app, publisher)

    response = client.put("/api/assignments/publication", json={
        "location_id": location.id, "week_start_date": str(week), "is_published": True,
    })
    app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    db_session.expire_all()
    rows = db_session.execute(select(WeeklyConstraint)).scalars().all()
    assert [(r.employee_id, r.group_id, r.date, r.constraint_type) for r in rows] == [
        (only_guard.id, morning.constraint_group_id, week, ConstraintType.CANNOT_WORK),
    ]
    submitted = {
        n.employee_id for n in db_session.execute(select(WeeklyNote)).scalars() if n.submitted_at is not None
    }
    assert submitted == {only_guard.id, both.id}
