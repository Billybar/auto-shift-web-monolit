# tests/test_employees.py
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