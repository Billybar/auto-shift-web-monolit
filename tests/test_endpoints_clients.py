
from app.api.dependencies import get_current_user, get_current_admin_user
from app.core.models import User, Organization, Client
from main import app


# --- Authorization Mocks ---

def override_get_current_user():
    """Simulates a logged-in regular employee."""
    return User(id=1, username="employee_test", role="employee")


def override_get_current_admin_user():
    """Simulates a logged-in admin user."""
    return User(id=2, username="admin_test", role="admin")


# --- Tests ---

def test_read_clients_unauthorized(client):
    """
    Ensure unauthorized access to read clients is blocked.
    """
    response = client.get("/clients/")
    assert response.status_code == 401


def test_create_client_as_admin(client, db_session):
    """
    Ensure an Admin can successfully create a new client under an existing organization.
    """
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user

    # Step 1: Create a parent Organization in the DB first
    org = Organization(name="Parent Org")
    db_session.add(org)
    db_session.commit()

    # Step 2: Attempt to create a client via API
    client_data = {
        "name": "Test Client",
        "organization_id": org.id
    }
    response = client.post("/clients/", json=client_data)

    app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["name"] == "Test Client"
    assert response.json()["organization_id"] == org.id


def test_create_client_invalid_organization(client, db_session):
    """
    Ensure creating a client fails if the provided organization_id does not exist.
    """
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user

    # Providing an arbitrary ID (e.g., 9999) that doesn't exist in the DB
    client_data = {
        "name": "Orphan Client",
        "organization_id": 9999
    }
    response = client.post("/clients/", json=client_data)

    app.dependency_overrides.clear()

    # Expecting 400 Bad Request due to missing parent organization
    assert response.status_code == 400
    assert "Organization not found" in response.json()["detail"]


def test_read_clients_as_employee(client, db_session):
    """
    Ensure a logged-in regular user can retrieve the list of clients.
    """
    app.dependency_overrides[get_current_user] = override_get_current_user

    # Setup: Create Org and Client directly in DB
    org = Organization(name="Viewable Parent Org")
    db_session.add(org)
    db_session.flush()  # flush to get org.id without committing yet

    client_db = Client(name="Viewable Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.commit()

    response = client.get("/clients/")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert any(c["name"] == "Viewable Client" for c in data)