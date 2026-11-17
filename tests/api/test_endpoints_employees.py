# tests/test_endpoints_employees.py
from app.core.models import User
from main import app
from tests.factories import admin_user, default_position, login_as, make_employee, make_location, make_position


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
