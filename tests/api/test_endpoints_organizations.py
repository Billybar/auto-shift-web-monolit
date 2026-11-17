from app.api.dependencies import get_current_user
from app.core.models import Organization, User
from main import app
from tests.factories import admin_user, login_as


def test_read_organizations_unauthorized(client):
    """No token, no organizations."""
    response = client.get("/api/organizations/")
    assert response.status_code == 401


def test_create_organization_as_admin(client, db_session):
    """An admin can create an organization."""
    login_as(app, admin_user())

    response = client.post("/api/organizations/", json={"name": "Test Organization"})
    app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["name"] == "Test Organization"
    assert "id" in response.json()


def test_create_duplicate_organization(client, db_session):
    """A second organization with the same name is a 400 (the web hierarchy screen relies on this message)."""
    db_session.add(Organization(name="Unique Org"))
    db_session.commit()
    login_as(app, admin_user())

    response = client.post("/api/organizations/", json={"name": "Unique Org"})
    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


def test_create_organization_forbidden_for_employee(client, db_session):
    """Only admins create organizations."""
    app.dependency_overrides[get_current_user] = lambda: User(id=902, email="employee@test.com", role="employee")

    response = client.post("/api/organizations/", json={"name": "Nope"})
    app.dependency_overrides.clear()

    assert response.status_code == 403


def test_read_organizations_as_employee(client, db_session):
    """Today any logged-in user lists every organization (see the note below)."""
    db_session.add(Organization(name="Viewable Org"))
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: User(id=902, email="employee@test.com", role="employee")

    response = client.get("/api/organizations/")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert any(o["name"] == "Viewable Org" for o in response.json())
