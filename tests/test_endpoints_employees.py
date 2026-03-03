# tests/test_endpoints_employees.py
from app.api.dependencies import get_current_admin_user
from app.core.models import User, Location, Organization, Client
from main import app

def test_read_employees_unauthorized(client):
    """
    Ensure unauthorized requests are blocked from accessing employee data.
    Verifies that the API returns 401 when no credentials are provided.
    """
    response = client.get("/employees/")
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"

def test_health_check(client):
    """
    Test that the root endpoint returns a 200 OK status.
    Ensures the basic application plumbing is working correctly.
    """
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "Auto-Shift API is running"}


def test_create_employee_logic(client, db_session):
    """
    Test employee creation logic with proper Dependency Override
    and valid payload mapping.
    """
    # 1. Bypass JWT Authentication for testing
    # We mock a logged-in admin user to satisfy the dependency
    def override_get_current_admin_user():
        return User(id=1, username="admin_test", role="admin")

    # Inject the mock dependency into the FastAPI app
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user

    # 2. Setup necessary DB relations (Location requires Client -> Organization)
    org = Organization(name="Test Org")
    db_session.add(org)
    db_session.flush()

    client_db = Client(name="Test Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.flush()

    # Create the target location for the employee
    location = Location(name="Test Location", client_id=client_db.id)
    db_session.add(location)
    db_session.commit()

    # 3. Create the correct payload matching schemas.EmployeeCreate
    employee_data = {
        "name": "John Doe",
        "location_id": location.id,
        "color": "FF0000",
        "is_active": True
    }

    # 4. Perform the request
    response = client.post("/employees/", json=employee_data)

    # Clean up the overrides after the test
    app.dependency_overrides.clear()

    # 5. Assertions
    assert response.status_code == 201
    assert response.json()["name"] == "John Doe"





def test_update_employee_settings_as_admin(client, db_session):
    """
    Test that an admin can update the optimization settings for an existing employee.
    ARCHITECTURAL NOTE: We test PUT directly because the settings record is
    auto-created when the employee is created.
    """
    # 1. Setup Admin override
    app.dependency_overrides[get_current_admin_user] = lambda: User(id=1, username="admin", role="admin")

    # 2. Setup Database Hierarchy (Org -> Client -> Location -> Employee)
    org = Organization(name="Settings Org")
    db_session.add(org)
    db_session.flush()

    client_db = Client(name="Settings Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.flush()

    location = Location(name="Settings Loc", client_id=client_db.id)
    db_session.add(location)
    db_session.commit()

    # Create Employee (This also creates the default EmployeeSettings in the DB)
    emp_data = {
        "name": "Settings Worker",
        "location_id": location.id,
        "color": "000000",
        "is_active": True
    }
    create_response = client.post("/employees/", json=emp_data)
    employee_id = create_response.json()["id"]

    # 3. Perform the PUT request to update settings
    new_settings = {
        "max_shifts_per_week": 4,
        "max_nights": 2
    }
    update_response = client.put(f"/employees/{employee_id}/settings", json=new_settings)

    app.dependency_overrides.clear()

    # 4. Assertions
    assert update_response.status_code == 200
    data = update_response.json()
    assert data["max_shifts_per_week"] == 4
    assert data["max_nights"] == 2


def test_update_employee_settings_not_found(client, db_session):
    """
    Ensure the API returns a 404 error if trying to update settings for a non-existent employee.
    """
    app.dependency_overrides[get_current_admin_user] = lambda: User(id=1, username="admin", role="admin")

    # Try to update an employee ID that doesn't exist (e.g., 9999)
    new_settings = {"max_shifts_per_week": 5}
    response = client.put("/employees/9999/settings", json=new_settings)

    app.dependency_overrides.clear()

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()