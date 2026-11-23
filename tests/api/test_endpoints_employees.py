# tests/test_endpoints_employees.py
from sqlalchemy import select

from app.core.models import Employee, User
from app.services import user_service
from main import app
from tests.factories import (
    admin_user, default_position, employee_user, login_as, make_employee, make_location, make_position,
    scheduler_user,
)


def test_read_employees_unauthorized(client):
    """No token, no employee data."""
    response = client.get("/api/employees/")
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


def test_health_check(client):
    """The health route answers 200 (basic plumbing of the app)."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "Auto-Shift API is running"}


def test_create_employee_logic(client, db_session):
    """Creating an employee also creates their login user and default settings."""
    location = make_location(db_session)
    db_session.commit()
    login_as(app, admin_user())

    response = client.post("/api/employees/", json={
        "location_id": location.id, "first_name": "John", "last_name": "Doe",
        "email": "john.doe@test.com", "password": "secret123", "color": "FF0000", "is_active": True,
    })
    app.dependency_overrides.clear()

    assert response.status_code == 201
    body = response.json()
    assert body["location_id"] == location.id
    assert body["color"] == "FF0000"
    assert body["is_active"] is True
    assert body["settings"]["max_shifts_per_week"] == 6

    user = db_session.query(User).filter_by(email="john.doe@test.com").one()
    assert user.role == "employee"
    assert user.employee_id == body["id"]
    assert user.hashed_password != "secret123"


def test_update_employee_settings_as_admin(client, db_session):
    """An admin can update the optimization settings of an existing employee."""
    location = make_location(db_session)
    employee = make_employee(db_session, location)
    db_session.commit()
    login_as(app, admin_user())

    response = client.put(
        f"/api/employees/{employee.id}/settings", json={"max_shifts_per_week": 4, "max_nights": 2},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["max_shifts_per_week"] == 4
    assert data["max_nights"] == 2


def test_employee_settings_soft_preferences(client, db_session):
    """New employees start at 'normal'; a partial update changes only the levels it sends."""
    location = make_location(db_session)
    employee = make_employee(db_session, location)
    db_session.commit()
    login_as(app, admin_user())

    response = client.put(
        f"/api/employees/{employee.id}/settings",
        json={
            "rest_gap_pref": "dont_care", "two_consecutive_nights_pref": "avoid",
            "two_rest_gaps_pref": "prefer_not",
        },
    )
    unchanged = client.put(f"/api/employees/{employee.id}/settings", json={"max_nights": 1})
    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["rest_gap_pref"] == "dont_care"
    assert data["two_consecutive_nights_pref"] == "avoid"
    assert data["consecutive_nights_pref"] == "normal"
    assert data["two_rest_gaps_pref"] == "prefer_not"
    assert unchanged.json()["rest_gap_pref"] == "dont_care"
    assert unchanged.json()["two_rest_gaps_pref"] == "prefer_not"


def test_employee_settings_rejects_bad_preference(client, db_session):
    """An unknown level, or an explicit null, is a 422 and changes nothing."""
    location = make_location(db_session)
    employee = make_employee(db_session, location)
    db_session.commit()
    login_as(app, admin_user())

    unknown = client.put(f"/api/employees/{employee.id}/settings", json={"rest_gap_pref": "never"})
    null = client.put(f"/api/employees/{employee.id}/settings", json={"consecutive_nights_pref": None})
    app.dependency_overrides.clear()

    assert unknown.status_code == 422
    assert null.status_code == 422
    db_session.expire_all()
    assert db_session.get(Employee, employee.id).settings.rest_gap_pref == "normal"


def test_update_employee_settings_not_found(client, db_session):
    """Updating settings of an employee that doesn't exist is a 404."""
    login_as(app, admin_user())

    response = client.put("/api/employees/9999/settings", json={"max_shifts_per_week": 5})
    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


# ==========================================
# Roles (positions)
# ==========================================


def _create_payload(location_id: int, email: str, **extra) -> dict:
    return {
        "location_id": location_id, "first_name": "Dana", "last_name": "Levi",
        "email": email, "password": "secret123", **extra,
    }


def test_create_in_single_role_location_gets_that_role(client, db_session):
    location = make_location(db_session)
    db_session.commit()
    login_as(app, admin_user())

    response = client.post("/api/employees/", json=_create_payload(location.id, "a@test.com"))
    app.dependency_overrides.clear()

    assert response.status_code == 201
    body = response.json()
    assert body["position_ids"] == [default_position(location).id]
    assert body["primary_position_id"] == default_position(location).id


def test_create_in_multi_role_location_without_roles_gets_none(client, db_session):
    location = make_location(db_session)
    make_position(db_session, location, "מאבטח")
    db_session.commit()
    login_as(app, admin_user())

    response = client.post("/api/employees/", json=_create_payload(location.id, "b@test.com"))
    app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["position_ids"] == []
    assert response.json()["primary_position_id"] is None


def test_create_with_roles_first_becomes_primary(client, db_session):
    location = make_location(db_session)
    guard = make_position(db_session, location, "מאבטח")
    supervisor = make_position(db_session, location, "אחמ\"ש", sort_order=2)
    db_session.commit()
    login_as(app, admin_user())

    response = client.post(
        "/api/employees/", json=_create_payload(location.id, "c@test.com", position_ids=[supervisor.id, guard.id])
    )
    app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["position_ids"] == sorted([guard.id, supervisor.id])
    assert response.json()["primary_position_id"] == supervisor.id


def test_role_of_another_location_is_rejected(client, db_session):
    location = make_location(db_session, "A")
    other = make_location(db_session, "B")
    db_session.commit()
    login_as(app, admin_user())

    response = client.post(
        "/api/employees/",
        json=_create_payload(location.id, "d@test.com", position_ids=[default_position(other).id]),
    )
    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json()["code"] == "position_invalid"


def test_primary_must_be_in_the_set(client, db_session):
    location = make_location(db_session)
    guard = make_position(db_session, location, "מאבטח")
    db_session.commit()
    login_as(app, admin_user())

    response = client.post(
        "/api/employees/",
        json=_create_payload(location.id, "e@test.com", position_ids=[guard.id],
                             primary_position_id=default_position(location).id),
    )
    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json()["code"] == "position_invalid"


def test_update_keeps_current_primary_when_still_in_set(client, db_session):
    location = make_location(db_session)
    general = default_position(location)
    guard = make_position(db_session, location, "מאבטח")
    supervisor = make_position(db_session, location, "אחמ\"ש", sort_order=2)
    employee = make_employee(db_session, location, [general, guard], primary=guard)
    db_session.commit()
    login_as(app, admin_user())

    kept = client.put(f"/api/employees/{employee.id}", json={"position_ids": [supervisor.id, guard.id]})
    replaced = client.put(f"/api/employees/{employee.id}", json={"position_ids": [supervisor.id, general.id]})
    explicit = client.put(f"/api/employees/{employee.id}", json={"primary_position_id": general.id})
    app.dependency_overrides.clear()

    assert kept.status_code == 200
    assert kept.json()["primary_position_id"] == guard.id
    assert replaced.json()["primary_position_id"] == supervisor.id, "Old primary left the set: the first id"
    assert explicit.json()["position_ids"] == sorted([supervisor.id, general.id])
    assert explicit.json()["primary_position_id"] == general.id


def test_update_without_role_fields_leaves_roles(client, db_session):
    location = make_location(db_session)
    guard = make_position(db_session, location, "מאבטח")
    employee = make_employee(db_session, location, [guard], primary=guard)
    db_session.commit()
    login_as(app, admin_user())

    response = client.put(f"/api/employees/{employee.id}", json={"notes": "hello"})
    app.dependency_overrides.clear()

    assert response.json()["position_ids"] == [guard.id]


def test_update_keeps_archived_roles(client, db_session):
    location = make_location(db_session)
    general = default_position(location)
    archived = make_position(db_session, location, "ישן", is_active=False)
    employee = make_employee(db_session, location, [general, archived], primary=general)
    db_session.commit()
    login_as(app, admin_user())

    response = client.put(f"/api/employees/{employee.id}", json={"position_ids": [general.id]})
    app.dependency_overrides.clear()

    assert response.json()["position_ids"] == sorted([general.id, archived.id])


def test_moving_to_another_location_clears_roles(client, db_session):
    location = make_location(db_session, "A")
    guard = make_position(db_session, location, "מאבטח")
    other = make_location(db_session, "B")
    employee = make_employee(db_session, location, [guard], primary=guard)
    db_session.commit()
    login_as(app, admin_user())

    response = client.put(f"/api/employees/{employee.id}", json={"location_id": other.id})
    app.dependency_overrides.clear()

    assert response.status_code == 200
    # B has a single role, so the employee gets it, as a new employee would
    assert response.json()["position_ids"] == [default_position(other).id]


# ==========================================
# Data scope of non-admins
# ==========================================


def _two_locations(db_session):
    """Location A (the scheduler's scope) and B (outside it), with one employee in each."""
    own = make_location(db_session, "A")
    other = make_location(db_session, "B")
    mine = make_employee(db_session, own)
    theirs = make_employee(db_session, other)
    db_session.commit()
    return own, other, mine, theirs


def test_scheduler_lists_only_employees_in_scope(client, db_session):
    own, other, mine, theirs = _two_locations(db_session)
    login_as(app, scheduler_user([own]))

    listing = client.get("/api/employees/")
    filtered = client.get("/api/employees/", params={"location_id": other.id})
    app.dependency_overrides.clear()

    assert [e["id"] for e in listing.json()] == [mine.id]
    assert filtered.json() == []


def test_scheduler_cannot_change_employees_out_of_scope(client, db_session):
    """Update, settings and delete of another location's employee answer 404, and nothing changes."""
    own, other, mine, theirs = _two_locations(db_session)
    login_as(app, scheduler_user([own]))

    update = client.put(f"/api/employees/{theirs.id}", json={"notes": "changed"})
    settings = client.put(f"/api/employees/{theirs.id}/settings", json={"max_shifts_per_week": 1})
    delete = client.delete(f"/api/employees/{theirs.id}")
    app.dependency_overrides.clear()

    assert (update.status_code, update.json()["detail"]) == (404, "Employee not found or access denied")
    assert (settings.status_code, settings.json()["detail"]) == (404, "Employee settings not found or access denied")
    assert (delete.status_code, delete.json()["detail"]) == (404, "Employee not found or access denied")
    db_session.expire_all()
    stored = db_session.get(Employee, theirs.id)
    assert stored.notes != "changed"
    assert stored.settings.max_shifts_per_week == 6


def test_scheduler_cannot_create_or_move_employees_out_of_scope(client, db_session):
    """Creating an employee in, or moving one to, a location outside the scope answers 404."""
    own, other, mine, theirs = _two_locations(db_session)
    login_as(app, scheduler_user([own]))

    create = client.post("/api/employees/", json=_create_payload(other.id, "new@test.com"))
    move = client.put(f"/api/employees/{mine.id}", json={"location_id": other.id})
    app.dependency_overrides.clear()

    assert (create.status_code, create.json()["detail"]) == (404, "Location not found or access denied")
    assert (move.status_code, move.json()["detail"]) == (404, "Location not found or access denied")
    db_session.expire_all()
    assert db_session.get(Employee, mine.id).location_id == own.id
    assert db_session.execute(select(User).where(User.email == "new@test.com")).scalar_one_or_none() is None


def test_admin_cannot_move_an_employee_to_a_missing_location(client, db_session):
    """Moving to a location that doesn't exist is a 404, not a database error."""
    location = make_location(db_session)
    employee = make_employee(db_session, location)
    db_session.commit()
    login_as(app, admin_user())

    response = client.put(f"/api/employees/{employee.id}", json={"location_id": 9999})
    app.dependency_overrides.clear()

    assert (response.status_code, response.json()["detail"]) == (404, "Location not found or access denied")
    db_session.expire_all()
    assert db_session.get(Employee, employee.id).location_id == location.id


# ==========================================
# Writes: update fields, delete, duplicate-email race
# ==========================================


def test_update_changes_login_and_employee_fields(client, db_session):
    location = make_location(db_session)
    employee = make_employee(db_session, location)
    employee_user(db_session, employee, "old@test.com")
    db_session.commit()
    login_as(app, admin_user())

    response = client.put(f"/api/employees/{employee.id}", json={
        "first_name": "Noa", "last_name": "Cohen", "email": "New@Test.com", "color": "00FF00",
        "is_active": False, "notes": "night only", "yalam_id": "y1", "mishmarot_id": "m1", "shiftorg_id": "s1",
    })
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert (body["user"]["first_name"], body["user"]["last_name"], body["user"]["email"]) == (
        "Noa", "Cohen", "new@test.com",
    )
    assert (body["color"], body["is_active"], body["notes"]) == ("00FF00", False, "night only")
    assert (body["yalam_id"], body["mishmarot_id"], body["shiftorg_id"]) == ("y1", "m1", "s1")


def test_update_with_null_fields_changes_nothing(client, db_session):
    """null means "don't change", like an omitted field."""
    location = make_location(db_session)
    employee = make_employee(db_session, location)
    employee.notes, employee.color = "keep", "00FF00"
    employee_user(db_session, employee, "keep@test.com")
    db_session.commit()
    login_as(app, admin_user())

    response = client.put(f"/api/employees/{employee.id}", json={
        "first_name": None, "email": None, "notes": None, "color": None, "is_active": None, "location_id": None,
    })
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert (body["notes"], body["color"], body["is_active"], body["location_id"]) == (
        "keep", "00FF00", True, location.id,
    )
    assert (body["user"]["first_name"], body["user"]["email"]) == ("W", "keep@test.com")


def test_delete_removes_the_employee_and_their_login(client, db_session):
    location = make_location(db_session)
    employee = make_employee(db_session, location)
    user = employee_user(db_session, employee)
    db_session.commit()
    employee_id, user_id = employee.id, user.id
    login_as(app, admin_user())

    response = client.delete(f"/api/employees/{employee_id}")
    app.dependency_overrides.clear()

    assert response.status_code == 204
    db_session.expire_all()
    assert db_session.get(Employee, employee_id) is None
    assert db_session.get(User, user_id) is None


def _email_free_on_first_check(monkeypatch):
    """The pre-check sees the email as free, as if another request saved it just after."""
    real = user_service.email_taken
    calls = []

    def fake(db, email, exclude_user_id=None):
        calls.append(email)
        return False if len(calls) == 1 else real(db, email, exclude_user_id=exclude_user_id)

    monkeypatch.setattr(user_service, "email_taken", fake)


def test_create_answers_409_when_the_email_is_taken_during_the_request(client, db_session, monkeypatch):
    location = make_location(db_session)
    employee_user(db_session, make_employee(db_session, location), "taken@test.com")
    db_session.commit()
    _email_free_on_first_check(monkeypatch)
    login_as(app, admin_user())

    response = client.post("/api/employees/", json=_create_payload(location.id, "taken@test.com"))
    app.dependency_overrides.clear()

    assert (response.status_code, response.json()["detail"]) == (409, "Email already registered")
    assert len(db_session.execute(select(Employee)).scalars().all()) == 1


def test_update_answers_409_when_the_email_is_taken_during_the_request(client, db_session, monkeypatch):
    location = make_location(db_session)
    mover = make_employee(db_session, location)
    employee_user(db_session, mover, "mine@test.com")
    employee_user(db_session, make_employee(db_session, location), "taken@test.com")
    db_session.commit()
    _email_free_on_first_check(monkeypatch)
    login_as(app, admin_user())

    response = client.put(f"/api/employees/{mover.id}", json={"email": "taken@test.com", "notes": "x"})
    app.dependency_overrides.clear()

    assert (response.status_code, response.json()["detail"]) == (409, "Email already in use by another user")
    db_session.expire_all()
    assert db_session.get(Employee, mover.id).user.email == "mine@test.com"
    assert db_session.get(Employee, mover.id).notes is None


def test_client_link_reaches_employees_of_every_location_of_the_client(client, db_session):
    own, other, mine, theirs = _two_locations(db_session)
    sibling = make_location(db_session, "A2", client=own.client)
    cousin = make_employee(db_session, sibling)
    db_session.commit()
    login_as(app, scheduler_user(clients=[own.client]))

    listing = client.get("/api/employees/")
    settings = client.put(f"/api/employees/{cousin.id}/settings", json={"max_shifts_per_week": 4})
    app.dependency_overrides.clear()

    assert sorted(e["id"] for e in listing.json()) == sorted([mine.id, cousin.id])
    assert settings.status_code == 200
