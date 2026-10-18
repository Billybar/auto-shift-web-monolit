import datetime
from sqlalchemy import select
from app.api.dependencies import get_current_user, get_current_admin_user, get_current_scheduler_user
from app.core.models import User, Location, Organization, Client, Employee, ShiftDefinition, WeeklyConstraint, WeeklyNote
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

def override_get_current_scheduler_admin():
    """Simulates a logged-in admin passing the scheduler guard (admins skip the location scope check)."""
    return User(id=4, email="import_admin@test.com", role="admin", employee_id=None)


def test_import_mishmarot_html_mirrors_weekly_notes(client, db_session):
    """
    Importing a Mishmarot export replaces the week's notes of every mapped employee:
    a real comment overwrites the old note, a cyclic-marker-only comment clears it.
    """
    app.dependency_overrides[get_current_scheduler_user] = override_get_current_scheduler_admin

    org = Organization(name="Import Org")
    db_session.add(org)
    db_session.flush()
    client_db = Client(name="Import Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.flush()
    location = Location(name="Import Loc", client_id=client_db.id)
    db_session.add(location)
    db_session.flush()

    db_session.add(ShiftDefinition(location_id=location.id, name="Morning", start_time="07:00", end_time="15:00"))
    emp_with_comment = Employee(location_id=location.id, mishmarot_id="323868125")
    emp_cycle_only = Employee(location_id=location.id, mishmarot_id="105737")
    db_session.add_all([emp_with_comment, emp_cycle_only])
    db_session.flush()

    week = datetime.date(2026, 10, 18)
    db_session.add_all([
        WeeklyNote(employee_id=emp_with_comment.id, week_start_date=week, note="old note"),
        WeeklyNote(employee_id=emp_cycle_only.id, week_start_date=week, note="typed in AutoShift"),
    ])
    db_session.commit()

    html_content = (
        "<script>var ovedData = new Array(3);"
        "ovedData[1]={ovedId:'105737', ovedName:'א', constrainsIsCycle:true,comments: '*מחזורי', remark:''};"
        "ovedData[2]={ovedId:'323868125', ovedName:'ב', constrainsIsCycle:false,"
        "comments: 'רוצה לפחות 3 משמרות &#128591;<br>', remark:''};"
        "ovedData[3]={ovedId:'999', ovedName:'ג', constrainsIsCycle:false,comments: 'לא ממופה', remark:''};"
        'ovedpotentialnotokR[1][2] =",1,";'
        "</script>"
    )

    response = client.post(
        "/api/constraints/import-html",
        data={"source": "mishmarot", "start_of_week": str(week), "location_id": str(location.id)},
        # Real exports are Windows-1255; the endpoint falls back to it after UTF-8 fails
        files={"file": ("weekly_constrains.html", html_content.encode("windows-1255"), "text/html")},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["imported_notes_count"] == 1
    assert body["missing_employees_ids"] == ["999"]

    notes = {n.employee_id: n.note for n in db_session.execute(select(WeeklyNote)).scalars()}
    assert notes == {emp_with_comment.id: "רוצה לפחות 3 משמרות 🙏"}

    constraints = db_session.execute(select(WeeklyConstraint)).scalars().all()
    assert [(c.employee_id, c.date) for c in constraints] == [(emp_with_comment.id, week)]


def test_import_without_shift_definitions_returns_error_code(client, db_session):
    """
    Importing into a location that has no shift definitions fails with a machine-readable code,
    and `detail` stays a plain string for clients that only read `detail`.
    """
    app.dependency_overrides[get_current_scheduler_user] = override_get_current_scheduler_admin

    org = Organization(name="No Shifts Org")
    db_session.add(org)
    db_session.flush()
    client_db = Client(name="No Shifts Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.flush()
    location = Location(name="No Shifts Loc", client_id=client_db.id)
    db_session.add(location)
    db_session.flush()
    # A linked employee, so the import has something to write and reaches the shift lookup
    db_session.add(Employee(location_id=location.id, mishmarot_id="105737"))
    db_session.commit()

    html_content = (
        "<script>var ovedData = new Array(1);"
        "ovedData[1]={ovedId:'105737', ovedName:'א', constrainsIsCycle:false,comments: '', remark:''};"
        "</script>"
    )

    response = client.post(
        "/api/constraints/import-html",
        data={"source": "mishmarot", "start_of_week": "2026-10-25", "location_id": str(location.id)},
        files={"file": ("weekly_constrains.html", html_content.encode("utf-8"), "text/html")},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "import_no_shift_definitions"
    assert isinstance(body["detail"], str)
    assert db_session.execute(select(WeeklyConstraint)).scalars().all() == []


def test_import_rejects_non_html_file_with_error_code(client, db_session):
    """A non-HTML upload is rejected before parsing, with the import_invalid_file_type code."""
    app.dependency_overrides[get_current_scheduler_user] = override_get_current_scheduler_admin

    response = client.post(
        "/api/constraints/import-html",
        data={"source": "yalam", "start_of_week": "2026-10-25", "location_id": "1"},
        files={"file": ("constraints.txt", b"not html", "text/plain")},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json()["code"] == "import_invalid_file_type"
