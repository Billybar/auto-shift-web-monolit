# tests/test_endpoints_locations.py
from sqlalchemy import select

from app.api.dependencies import get_current_user, get_current_admin_user, get_current_scheduler_user
from app.core.constants import DEFAULT_LOCATION_WEIGHTS
from app.core.models import User, Organization, Client, Location, LocationWeights
from app.core.schemas import LocationWeightsBase
from main import app


# --- Authorization Mocks ---

def override_get_current_user():
    """Simulates a logged-in regular employee."""
    return User(id=1, email="employee_test@example.com", role="employee")


def override_get_current_admin_user():
    """Simulates a logged-in admin user."""
    return User(id=2, email="admin_test@example.com", role="admin")


# --- Helpers ---

def create_location_via_api(client, db_session, name: str) -> int:
    """Creates the Org -> Client hierarchy in the DB and the location through the API. Returns its ID."""
    org = Organization(name=f"{name} Org")
    db_session.add(org)
    db_session.flush()

    client_db = Client(name=f"{name} Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.commit()

    loc_data = {"name": name, "client_id": client_db.id, "cycle_length": 7, "shifts_per_day": 3}
    response = client.post("/api/locations/", json=loc_data)
    assert response.status_code == 201
    return response.json()["id"]


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
    response = client.post("/api/locations/", json=location_data)

    app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["name"] == "Test Location"
    assert response.json()["client_id"] == client_db.id

    # Every new location gets a weights row with the default values
    weights = response.json()["weights"]
    assert weights is not None
    assert {key: weights[key] for key in DEFAULT_LOCATION_WEIGHTS} == DEFAULT_LOCATION_WEIGHTS


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
    # 1. Setup Admin override (the weights endpoint is guarded by the scheduler guard)
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user
    app.dependency_overrides[get_current_scheduler_user] = override_get_current_admin_user

    # 2. Setup Database Hierarchy (Org -> Client -> Location)
    location_id = create_location_via_api(client, db_session, "Weights Loc")

    # 3. Perform the PUT request to update weights
    # We change a couple of specific constraints for the solver
    new_weights = {
        "target_shifts": 60,
        "consecutive_nights": 150
    }
    update_response = client.put(f"/api/locations/{location_id}/weights", json=new_weights)

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
    app.dependency_overrides[get_current_scheduler_user] = override_get_current_admin_user

    new_weights = {"target_shifts": 50}
    response = client.put("/api/locations/9999/weights", json=new_weights)

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_partial_weights_update_keeps_other_fields(client, db_session):
    """
    A PUT that sends only some fields must not reset the other fields to their defaults.
    """
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user
    app.dependency_overrides[get_current_scheduler_user] = override_get_current_admin_user

    location_id = create_location_via_api(client, db_session, "Partial Loc")

    first = client.put(f"/api/locations/{location_id}/weights", json={"rest_gap": 77})
    second = client.put(f"/api/locations/{location_id}/weights", json={"target_shifts": 60})

    app.dependency_overrides.clear()

    assert first.status_code == 200
    assert second.status_code == 200
    data = second.json()
    assert data["target_shifts"] == 60
    assert data["rest_gap"] == 77
    assert data["max_nights"] == DEFAULT_LOCATION_WEIGHTS["max_nights"]


def test_delete_location_with_weights(client, db_session):
    """
    Deleting a location also deletes its weights row instead of failing on the NOT NULL foreign key.
    """
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user

    location_id = create_location_via_api(client, db_session, "Doomed Loc")
    response = client.delete(f"/api/locations/{location_id}")

    app.dependency_overrides.clear()

    assert response.status_code == 204
    remaining = db_session.execute(
        select(LocationWeights).where(LocationWeights.location_id == location_id)
    ).scalars().all()
    assert remaining == []


def test_weight_defaults_share_one_source():
    """
    The API schema and the model column defaults must both match DEFAULT_LOCATION_WEIGHTS.
    """
    assert LocationWeightsBase().model_dump() == DEFAULT_LOCATION_WEIGHTS

    columns = LocationWeights.__table__.c
    assert {key: columns[key].default.arg for key in DEFAULT_LOCATION_WEIGHTS} == DEFAULT_LOCATION_WEIGHTS