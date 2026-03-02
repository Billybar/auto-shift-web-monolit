# tests/test_endpoints_assignments.py

import datetime
from app.api.dependencies import get_current_user, get_current_admin_user
from app.core.models import User, Organization, Client, Location, Employee, ShiftDefinition, Assignment
from main import app


# --- Authorization Mocks ---

def override_get_current_user():
    """Simulates a logged-in regular employee."""
    return User(id=1, username="employee_test", role="employee")


def override_get_current_admin_user():
    """Simulates a logged-in admin user."""
    return User(id=2, username="admin_test", role="admin")


# --- Helper Setup Function ---

def setup_assignment_dependencies(db_session):
    """
    Creates the required hierarchy (Org -> Client -> Location -> Employee + Shift)
    so we can test assignment creation properly.
    Returns location_id, employee_id, and shift_id.
    """
    org = Organization(name="Assignment Org")
    db_session.add(org)
    db_session.flush()

    client_db = Client(name="Assignment Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.flush()

    location = Location(name="Assignment Loc", client_id=client_db.id)
    db_session.add(location)
    db_session.flush()

    emp = Employee(name="Assignment Worker", location_id=location.id)
    db_session.add(emp)
    db_session.flush()

    shift = ShiftDefinition(location_id=location.id, shift_name="Morning")
    db_session.add(shift)
    db_session.commit()

    return location.id, emp.id, shift.id


# --- Tests ---

def test_read_assignments_unauthorized(client):
    """
    Ensure unauthorized access to read assignments is blocked.
    """
    response = client.get("/assignments/?location_id=1&start_date=2023-01-01&end_date=2023-01-07")
    assert response.status_code == 401


def test_read_assignments_as_employee(client, db_session):
    """
    Ensure a logged-in regular user can retrieve the schedule for a given date range.
    """
    app.dependency_overrides[get_current_user] = override_get_current_user

    loc_id, emp_id, shift_id = setup_assignment_dependencies(db_session)
    test_date = datetime.date(2023, 10, 1)

    # Insert a manual assignment into the DB
    assignment = Assignment(
        location_id=loc_id,
        employee_id=emp_id,
        shift_id=shift_id,
        date=test_date
    )
    db_session.add(assignment)
    db_session.commit()

    # Request assignments for that week
    response = client.get(
        f"/assignments/?location_id={loc_id}&start_date=2023-10-01&end_date=2023-10-07"
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["employee_id"] == emp_id
    assert data[0]["date"] == str(test_date)


def test_sync_assignments_forbidden_for_employee(client, db_session):
    """
    Ensure regular employees CANNOT save/sync the schedule (Admin only).
    """
    app.dependency_overrides[get_current_user] = override_get_current_user

    # Trying to POST to the assignments endpoint as a regular user
    response = client.post(
        "/assignments/?location_id=1&start_date=2023-10-01&end_date=2023-10-07",
        json=[]
    )

    app.dependency_overrides.clear()

    # Because our override only covers `get_current_user` and not `get_current_admin_user`,
    # the admin dependency will fail and return 401 (or 403 depending on implementation).
    assert response.status_code in [401, 403]


def test_sync_weekly_assignments_smart_sync_logic(client, db_session):
    """
    Test the Smart Sync logic:
    1. Keep existing assignments that are in the payload.
    2. Add new assignments.
    3. Delete assignments that are in the DB but missing from the payload.
    """
    app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user

    loc_id, emp_id, shift_id = setup_assignment_dependencies(db_session)

    date_sunday = datetime.date(2023, 10, 1)
    date_monday = datetime.date(2023, 10, 2)
    date_tuesday = datetime.date(2023, 10, 3)

    # Step 1: Seed the database with two assignments (Sunday and Monday)
    assignment_sun = Assignment(location_id=loc_id, employee_id=emp_id, shift_id=shift_id, date=date_sunday)
    assignment_mon = Assignment(location_id=loc_id, employee_id=emp_id, shift_id=shift_id, date=date_monday)
    db_session.add_all([assignment_sun, assignment_mon])
    db_session.commit()

    # Step 2: Prepare the incoming payload from the "Frontend"
    # We will KEEP Sunday, REMOVE Monday (by omitting it), and ADD Tuesday.
    payload = [
        {"employee_id": emp_id, "shift_id": shift_id, "date": str(date_sunday)},  # Existing (Keep)
        {"employee_id": emp_id, "shift_id": shift_id, "date": str(date_tuesday)}  # New (Add)
    ]

    # Step 3: Call the Sync Endpoint
    response = client.post(
        f"/assignments/?location_id={loc_id}&start_date=2023-10-01&end_date=2023-10-07",
        json=payload
    )

    app.dependency_overrides.clear()

    # Step 4: Validate the API response stats
    assert response.status_code == 200
    data = response.json()
    assert data["added"] == 1  # Tuesday added
    assert data["removed"] == 1  # Monday removed
    assert data["unchanged"] == 1  # Sunday kept

    # Step 5: Validate the actual Database state
    final_assignments = db_session.query(Assignment).filter(Assignment.location_id == loc_id).all()
    assert len(final_assignments) == 2

    dates_in_db = [a.date for a in final_assignments]
    assert date_sunday in dates_in_db
    assert date_tuesday in dates_in_db
    assert date_monday not in dates_in_db  # Monday should be gone