# tests/test_employees.py

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
    Test employee creation logic.
    Note: This test assumes we override authentication dependencies
    to bypass JWT requirements during unit testing.
    """
    employee_data = {
        "full_name": "John Doe",
        "email": "john@example.com",
        "role": "manager"
    }

    # We use a POST request to the employees endpoint
    response = client.post("/employees/", json=employee_data)

    assert response.status_code == 201
    assert response.json()["full_name"] == "John Doe"
    assert "id" in response.json()