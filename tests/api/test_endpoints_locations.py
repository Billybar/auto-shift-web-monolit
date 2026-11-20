# tests/test_endpoints_locations.py
from sqlalchemy import select

from app.api.dependencies import get_current_user, get_current_admin_user, get_current_scheduler_user
from app.core.constants import DEFAULT_LOCATION_WEIGHTS
from app.core.models import User, Organization, Client, Location, LocationWeights
from app.core.schemas import LocationWeightsBase
from main import app
from app.core.models import Position, ShiftDemand
from tests.factories import admin_user, default_position, employee_user, login_as, make_employee, make_location, make_position, make_shift, scheduler_user



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
    response = client.get("/api/locations/")
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
    """Creating a location under a client that doesn't exist is a 400."""
    login_as(app, admin_user())

    response = client.post(
        "/api/locations/",
        json={"name": "Orphan Location", "client_id": 9999, "cycle_length": 7, "shifts_per_day": 3},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "Client not found" in response.json()["detail"]


def test_employee_sees_only_their_own_location(client, db_session):
    """An employee's scope is their own location: it is listed, any other location answers 404."""
    own = make_location(db_session, "Own")
    other = make_location(db_session, "Other")
    user = employee_user(db_session, make_employee(db_session, own))
    db_session.commit()
    login_as(app, user)

    listing = client.get("/api/locations/")
    own_location = client.get(f"/api/locations/{own.id}")
    other_location = client.get(f"/api/locations/{other.id}")
    app.dependency_overrides.clear()

    assert [loc["name"] for loc in listing.json()] == ["Own"]
    assert own_location.status_code == 200
    assert other_location.status_code == 404
    assert other_location.json()["detail"] == "Location not found or access denied"



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

# ==========================================
# Roles (positions) and the weekly demand template
# ==========================================


def test_new_location_gets_default_role(client, db_session):
    org = Organization(name="Org")
    db_session.add(org)
    db_session.flush()
    client_db = Client(name="Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.commit()
    login_as(app, admin_user())

    response = client.post("/api/locations/", json={"name": "New", "client_id": client_db.id})
    app.dependency_overrides.clear()

    assert response.status_code == 201
    positions = db_session.query(Position).filter_by(location_id=response.json()["id"]).all()
    assert [(p.name, p.is_active) for p in positions] == [("כללי", True)]


def test_template_get_and_put(client, db_session):
    location = make_location(db_session)
    general = default_position(location)
    guard = make_position(db_session, location, "מאבטח")
    morning = make_shift(db_session, location)
    db_session.add(ShiftDemand(shift_definition_id=morning.id, day_of_week=3, position_id=general.id, required_employees=4))
    db_session.commit()
    login_as(app, admin_user())

    put = client.put(f"/api/locations/{location.id}/demand-template", json={"cells": [
        {"shift_id": morning.id, "position_id": general.id, "day_of_week": 0, "required_employees": 1},
        {"shift_id": morning.id, "position_id": guard.id, "day_of_week": 0, "required_employees": 2},
        {"shift_id": morning.id, "position_id": guard.id, "day_of_week": 1, "required_employees": 0},
    ]})
    get = client.get(f"/api/locations/{location.id}/demand-template")
    app.dependency_overrides.clear()

    assert put.status_code == 200
    expected = [
        {"shift_id": morning.id, "position_id": general.id, "day_of_week": 0, "required_employees": 1},
        {"shift_id": morning.id, "position_id": guard.id, "day_of_week": 0, "required_employees": 2},
    ]
    assert put.json()["cells"] == expected, "The Wednesday row was left out, so it is cleared; zeros aren't stored"
    assert get.json()["cells"] == expected


def test_template_rejects_archived_and_foreign_roles(client, db_session):
    location = make_location(db_session, "A")
    archived = make_position(db_session, location, "ישן", is_active=False)
    other = make_location(db_session, "B")
    morning = make_shift(db_session, location)
    db_session.commit()
    login_as(app, admin_user())

    responses = [
        client.put(f"/api/locations/{location.id}/demand-template", json={"cells": [
            {"shift_id": morning.id, "position_id": position_id, "day_of_week": 0, "required_employees": 1},
        ]})
        for position_id in (archived.id, default_position(other).id)
    ]
    app.dependency_overrides.clear()

    assert [r.status_code for r in responses] == [400, 400]
    assert all(r.json()["code"] == "position_invalid" for r in responses)



# ==========================================
# Data scope of non-admins
# ==========================================


def test_scheduler_sees_only_locations_in_scope(client, db_session):
    """A scheduler reaches the locations linked to them; another location and its weights answer 404."""
    own = make_location(db_session, "Own")
    other = make_location(db_session, "Other")
    db_session.commit()
    login_as(app, scheduler_user([own]))

    listing = client.get("/api/locations/")
    other_location = client.get(f"/api/locations/{other.id}")
    other_weights = client.get(f"/api/locations/{other.id}/weights")
    app.dependency_overrides.clear()

    assert [loc["name"] for loc in listing.json()] == ["Own"]
    assert other_location.status_code == 404
    assert other_location.json()["detail"] == "Location not found or access denied"
    assert other_weights.status_code == 404
    assert other_weights.json()["detail"] == "Weights not found or access denied"


def test_client_link_covers_every_location_of_the_client(client, db_session):
    """A user linked to a client reaches all of its locations, including writing their weights."""
    first = make_location(db_session, "First")
    second = make_location(db_session, "Second", client=first.client)
    make_location(db_session, "Other")
    db_session.commit()
    login_as(app, scheduler_user(clients=[first.client]))

    listing = client.get("/api/locations/")
    weights = client.put(f"/api/locations/{second.id}/weights", json={"rest_gap": 77})
    app.dependency_overrides.clear()

    assert sorted(loc["name"] for loc in listing.json()) == ["First", "Second"]
    assert weights.status_code == 200
    assert weights.json()["rest_gap"] == 77


def test_weights_put_out_of_scope_is_refused(client, db_session):
    """A non-admin gets the same 404 for a location outside their scope and for one that doesn't exist."""
    own = make_location(db_session, "Own")
    other = make_location(db_session, "Other")
    db_session.commit()
    login_as(app, scheduler_user([own]))

    out_of_scope = client.put(f"/api/locations/{other.id}/weights", json={"rest_gap": 77})
    missing = client.put("/api/locations/9999/weights", json={"rest_gap": 77})
    app.dependency_overrides.clear()

    assert (out_of_scope.status_code, out_of_scope.json()["detail"]) == (404, "Location not found or access denied")
    assert (missing.status_code, missing.json()["detail"]) == (404, "Location not found or access denied")
    db_session.expire_all()
    assert db_session.get(Location, other.id).weights.rest_gap == DEFAULT_LOCATION_WEIGHTS["rest_gap"]


def test_employee_own_location_does_not_cover_its_weights(client, db_session):
    """
    The location routes count an employee's own location; the weights route doesn't, it checks only
    the linked locations and clients. (Employees created through the API are linked to their location.)
    """
    own = make_location(db_session, "Own")
    user = employee_user(db_session, make_employee(db_session, own))
    db_session.commit()
    login_as(app, user)

    location = client.get(f"/api/locations/{own.id}")
    weights = client.get(f"/api/locations/{own.id}/weights")
    app.dependency_overrides.clear()

    assert location.status_code == 200
    assert weights.status_code == 404
