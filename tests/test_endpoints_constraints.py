import datetime
from app.api.dependencies import get_current_user, get_current_admin_user
from app.core.models import User, Location, Organization, Client, Employee, ShiftDefinition, WeeklyConstraint
from main import app


# --- Authorization Mocks ---

def override_get_current_user_employee_1():
    """Simulates a logged-in regular employee linked to employee_id 1."""
    return User(id=1, username="emp1", role="employee", employee_id=1)


def override_get_current_user_employee_2():
    """Simulates a logged-in regular employee linked to employee_id 2."""
    return User(id=2, username="emp2", role="employee", employee_id=2)


def override_get_current_admin_user():
    """Simulates a logged-in admin user."""
    return User(id=3, username="admin_test", role="admin", employee_id=None)


# --- Helper Setup Function ---

def setup_constraint_dependencies(db_session):
    """
    Creates the required hierarchy (Org -> Client -> Location -> Employee + Shift)
    so we can test constraint creation properly.
    Returns employee_id and shift_id.
    """
    org = Organization(name="Constraint Org")
    db_session.add(org)
    db_session.flush()

    client_db = Client(name="Constraint Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.flush()

    location = Location(name="Constraint Loc", client_id=client_db.id)
    db_session.add(location)
    db_session.flush()

    emp = Employee(name="Constraint Worker", location_id=location.id)
    db_session.add(emp)
    db_session.flush()

    shift = ShiftDefinition(location_id=location.id, shift_name="Morning")
    db_session.add(shift)
    db_session.commit()

    return emp.id, shift.id


# --- Tests ---

def test_create_constraint_success(client, db_session):
    """
    Ensure an employee can create a constraint for themselves.
    """
    app.dependency_overrides[get_current_user] = override_get_current_user_employee_1

    # In this test, we force the employee ID to be 1 to match our mock user
    emp_id, shift_id = setup_constraint_dependencies(db_session)

    # Update the employee's ID to 1 to match the override user
    emp = db_session.query(Employee).filter(Employee.id == emp_id).first()
    emp.id = 1
    db_session.commit()

    constraint_data = {
        "employee_id": 1,
        "shift_id": shift_id,
        "date": str(datetime.date.today()),
        "constraint_type": "cannot_work"
    }

    response = client.post("/constraints/", json=constraint_data)
    app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["constraint_type"] == "cannot_work"


def test_create_constraint_forbidden(client, db_session):
    """
    Ensure an employee CANNOT create a constraint for a DIFFERENT employee.
    """
    # User 1 is logged in
    app.dependency_overrides[get_current_user] = override_get_current_user_employee_1

    emp_id, shift_id = setup_constraint_dependencies(db_session)

    # Attempting to submit a constraint for Employee 2
    constraint_data = {
        "employee_id": 2,
        "shift_id": shift_id,
        "date": str(datetime.date.today()),
        "constraint_type": "prefer_not"
    }

    response = client.post("/constraints/", json=constraint_data)
    app.dependency_overrides.clear()

    # Should be blocked
    assert response.status_code == 403
    assert "Not authorized" in response.json()["detail"]


def test_read_constraints_as_admin(client, db_session):
    """
    Ensure an Admin can read constraints of any employee.
    """
    app.dependency_overrides[get_current_user] = override_get_current_admin_user

    emp_id, shift_id = setup_constraint_dependencies(db_session)

    # Inject a constraint directly into DB
    constraint = WeeklyConstraint(
        employee_id=emp_id,
        shift_id=shift_id,
        date=datetime.date.today(),
        constraint_type="must_work"
    )
    db_session.add(constraint)
    db_session.commit()

    # Admin requests constraints for a specific employee
    response = client.get(f"/constraints/?employee_id={emp_id}")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["constraint_type"] == "must_work"