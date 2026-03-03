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


# update optimization weight under specific location
def test_update_location_weights_as_admin(client, db_session):
    """
    Test that an admin can update the global optimization weights for a location.
    """
    # 1. Setup Admin override
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user

    # 2. Setup Database Hierarchy (Org -> Client -> Location)
    org = Organization(name="Weights Org")
    db_session.add(org)
    db_session.flush()

    client_db = Client(name="Weights Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.commit()

    # Create Location
    loc_data = {
        "name": "Weights Loc",
        "client_id": client_db.id,
        "cycle_length": 7,
        "shifts_per_day": 3
    }
    create_response = client.post("/locations/", json=loc_data)
    location_id = create_response.json()["id"]

    # 3. Perform the PUT request to update weights
    # We change a couple of specific constraints for the solver
    new_weights = {
        "target_shifts": 60,
        "consecutive_nights": 150
    }
    update_response = client.put(f"/locations/{location_id}/weights", json=new_weights)

    app.dependency_overrides.clear()

    # 4. Assertions
    assert update_response.status_code == 200
    data = update_response.json()
    # Ensure the updated fields match
    assert data["target_shifts"] == 60
    assert data["consecutive_nights"] == 150
    # Ensure other default fields are still present and returned
    assert "rest_gap" in data


def test_update_location_weights_not_found(client, db_session):
    """
    Ensure the API returns a 404 error if trying to update weights for a non-existent location.
    """
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user

    new_weights = {"target_shifts": 50}
    response = client.put("/locations/9999/weights", json=new_weights)

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()