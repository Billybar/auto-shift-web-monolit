# tests/test_endpoints_locations.py
from app.api.dependencies import get_current_user, get_current_admin_user
from app.core.models import User, Organization, Client, Location
from main import app


# --- Authorization Mocks ---

def override_get_current_user():
    """Simulates a logged-in regular employee."""
    return User(id=1, username="employee_test", role="employee")


def override_get_current_admin_user():
    """Simulates a logged-in admin user."""
    return User(id=2, username="admin_test", role="admin")


# --- Tests ---

def test_read_locations_unauthorized(client):
    """
    Ensure unauthorized access to read locations is blocked.
    """
    response = client.get("/locations/")
    assert response.status_code == 401


def test_create_location_as_admin(client, db_session):
    """
    Ensure an Admin can successfully create a new location under an existing client.
    """
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user

    # Step 1: Create Organization and Client hierarchy in the DB
    org = Organization(name="Hierarchy Org")
    db_session.add(org)
    db_session.flush()

    client_db = Client(name="Hierarchy Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.commit()

    # Step 2: Attempt to create a location via API
    location_data = {
        "name": "Test Location",
        "client_id": client_db.id,
        "cycle_length": 7,
        "shifts_per_day": 3
    }
    response = client.post("/locations/", json=location_data)

    app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["name"] == "Test Location"
    assert response.json()["client_id"] == client_db.id


def test_create_location_invalid_client(client, db_session):
    """
    Ensure creating a location fails if the provided client_id does not exist.
    """
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user

    # Providing a non-existent client ID
    location_data = {
        "name": "Orphan Location",
        "client_id": 9999,
        "cycle_length": 7,
        "shifts_per_day": 3
    }
    response = client.post("/locations/", json=location_data)

    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "Client not found" in response.json()["detail"]


def test_read_locations_as_employee(client, db_session):
    """
    Ensure a logged-in regular user can retrieve the list of locations.
    """
    app.dependency_overrides[get_current_user] = override_get_current_user

    # Setup Database Records
    org = Organization(name="Loc Org")
    db_session.add(org)
    db_session.flush()

    client_db = Client(name="Loc Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.flush()

    location_db = Location(name="Viewable Location", client_id=client_db.id)
    db_session.add(location_db)
    db_session.commit()

    response = client.get("/locations/")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert any(loc["name"] == "Viewable Location" for loc in data)