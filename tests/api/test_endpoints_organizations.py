
from app.api.dependencies import get_current_user, get_current_admin_user
from app.core.models import User, Organization
from main import app


# --- Authorization Mocks ---

def override_get_current_user():
    """Simulates a logged-in regular employee."""
    return User(id=1, username="employee_test", role="employee")


def override_get_current_admin_user():
    """Simulates a logged-in admin user."""
    return User(id=2, username="admin_test", role="admin")


# --- Tests ---

def test_read_organizations_unauthorized(client):
    """
    Ensure unauthorized access to read organizations is blocked.
    """
    # Intentionally not using dependency overrides here to test the guard
    response = client.get("/organizations/")
    assert response.status_code == 401


def test_create_organization_as_admin(client, db_session):
    """
    Ensure an Admin can successfully create a new organization.
    """
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user

    org_data = {"name": "Test Organization"}
    response = client.post("/organizations/", json=org_data)

    app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["name"] == "Test Organization"
    assert "id" in response.json()


def test_create_duplicate_organization(client, db_session):
    """
    Ensure the system raises an error when creating an organization with a name that already exists.
    """
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user

    # Step 1: Insert an initial organization directly into the DB
    org = Organization(name="Unique Org")
    db_session.add(org)
    db_session.commit()

    # Step 2: Attempt to create an organization via the API with the same name
    org_data = {"name": "Unique Org"}
    response = client.post("/organizations/", json=org_data)

    app.dependency_overrides.clear()

    # Expecting a 400 Bad Request error
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


def test_read_organizations_as_employee(client, db_session):
    """
    Ensure a logged-in regular user can retrieve the list of organizations.
    """
    app.dependency_overrides[get_current_user] = override_get_current_user

    # Create an organization directly in the DB for testing purposes
    org = Organization(name="Viewable Org")
    db_session.add(org)
    db_session.commit()

    response = client.get("/organizations/")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert any(o["name"] == "Viewable Org" for o in data)