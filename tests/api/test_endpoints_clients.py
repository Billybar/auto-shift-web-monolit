from app.core.models import Organization
from main import app
from tests.factories import admin_user, employee_user, login_as, make_employee, make_location


def test_read_clients_unauthorized(client):
    """No token, no clients."""
    response = client.get("/api/clients/")
    assert response.status_code == 401


def test_create_client_as_admin(client, db_session):
    """An admin can create a client under an existing organization."""
    org = Organization(name="Parent Org")
    db_session.add(org)
    db_session.commit()
    login_as(app, admin_user())

    response = client.post("/api/clients/", json={"name": "Test Client", "organization_id": org.id})
    app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["name"] == "Test Client"
    assert response.json()["organization_id"] == org.id


def test_create_client_invalid_organization(client, db_session):
    """Creating a client under an organization that doesn't exist is a 400."""
    login_as(app, admin_user())

    response = client.post("/api/clients/", json={"name": "Orphan Client", "organization_id": 9999})
    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "Organization not found" in response.json()["detail"]


def test_create_client_forbidden_for_employee(client, db_session):
    """Only admins create clients."""
    location = make_location(db_session)
    user = employee_user(db_session, make_employee(db_session, location))
    db_session.commit()
    login_as(app, user)

    response = client.post("/api/clients/", json={"name": "X", "organization_id": 1})
    app.dependency_overrides.clear()

    assert response.status_code == 403


def test_employee_sees_only_the_client_of_their_own_location(client, db_session):
    """An employee's scope is their own location: its client is visible, any other client answers 404."""
    own = make_location(db_session, "Own")
    other = make_location(db_session, "Other")
    user = employee_user(db_session, make_employee(db_session, own))
    db_session.commit()
    login_as(app, user)

    listing = client.get("/api/clients/")
    own_client = client.get(f"/api/clients/{own.client_id}")
    other_client = client.get(f"/api/clients/{other.client_id}")
    app.dependency_overrides.clear()

    assert [c["name"] for c in listing.json()] == ["Own Client"]
    assert own_client.status_code == 200
    assert other_client.status_code == 404
    assert other_client.json()["detail"] == "Client not found or access denied"
