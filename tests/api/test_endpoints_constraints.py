import datetime
from sqlalchemy import select
from app.api.dependencies import get_current_user, get_current_admin_user, get_current_scheduler_user
from app.core.models import (
    User, Location, Organization, Client, ConstraintGroup, Employee, ShiftDefinition, WeeklyConstraint, WeeklyNote,
)
from app.services.constraint_group_service import create_group_for
from main import app
from tests.factories import admin_user, login_as, make_employee, make_location, make_shift, scheduler_user


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

    morning = ShiftDefinition(location_id=location.id, name="Morning", start_time="07:00", end_time="15:00")
    create_group_for(morning)
    db_session.add(morning)
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


def test_import_maps_each_slot_to_every_shift_of_its_category(client, db_session):
    """
    A site with two morning shifts and no night shift: a Mishmarot morning block (tiv 1) blocks both
    mornings, and a night block (tiv 4) has no shift to land on, so it is skipped.
    """
    app.dependency_overrides[get_current_scheduler_user] = override_get_current_scheduler_admin

    org = Organization(name="Categories Org")
    db_session.add(org)
    db_session.flush()
    client_db = Client(name="Categories Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.flush()
    location = Location(name="Categories Loc", client_id=client_db.id)
    db_session.add(location)
    db_session.flush()

    early = ShiftDefinition(location_id=location.id, name="בוקר א", start_time="06:00", end_time="14:00")
    late = ShiftDefinition(location_id=location.id, name="בוקר ב", start_time="07:00", end_time="15:00")
    evening = ShiftDefinition(location_id=location.id, name="ערב", start_time="15:00", end_time="23:00")
    employee = Employee(location_id=location.id, mishmarot_id="555")
    for shift in (early, late, evening):
        create_group_for(shift)
    db_session.add_all([early, late, evening, employee])
    db_session.commit()

    week = datetime.date(2026, 10, 25)
    html_content = (
        "<script>var ovedData = new Array(1);"
        "ovedData[1]={ovedId:'555', ovedName:'א', constrainsIsCycle:false,comments: '', remark:''};"
        'ovedpotentialnotokR[1][1] =",1,4,";'
        "</script>"
    )

    response = client.post(
        "/api/constraints/import-html",
        data={"source": "mishmarot", "start_of_week": str(week), "location_id": str(location.id)},
        files={"file": ("weekly_constrains.html", html_content.encode("utf-8"), "text/html")},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    constraints = db_session.execute(select(WeeklyConstraint)).scalars().all()
    assert {(c.employee_id, c.group_id, c.date) for c in constraints} == {
        (employee.id, early.constraint_group_id, week), (employee.id, late.constraint_group_id, week),
    }


# --- Constraints-board rows (groups) ---

WEEK = datetime.date(2026, 10, 25)


def _twin_mornings(db_session):
    """A location whose two 06:45 mornings share one board row, plus an evening on its own row."""
    location = make_location(db_session)
    reception = make_shift(db_session, location, "בוקר קבלה", "06:45", "15:00")
    guard = make_shift(db_session, location, "בוקר מאבטח", "06:45", "15:00")
    evening = make_shift(db_session, location, "ערב", "14:45", "23:00")
    old_guard_group = guard.constraint_group
    guard.constraint_group = reception.constraint_group
    db_session.delete(old_guard_group)
    employee = make_employee(db_session, location)
    db_session.commit()
    return location, reception, guard, evening, employee


def _sync(client, employee_id, constraints):
    return client.post(
        "/api/constraints/sync",
        params={"employee_id": employee_id, "start_date": str(WEEK), "end_date": str(WEEK + datetime.timedelta(days=6))},
        json={"constraints": constraints},
    )


def _item(employee_id, on_date=WEEK, constraint_type="cannot_work", **row):
    return {"employee_id": employee_id, "date": str(on_date), "constraint_type": constraint_type, **row}


def _stored(db_session):
    db_session.expire_all()
    rows = db_session.execute(select(WeeklyConstraint)).scalars().all()
    return {(r.group_id, r.date, r.constraint_type.value) for r in rows}


def test_sync_by_group_stores_one_row_and_get_returns_it_per_shift(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    login_as(app, admin_user())

    saved = _sync(client, employee.id, [_item(employee.id, group_id=reception.constraint_group_id)])
    read = client.get(
        "/api/constraints/",
        params={"employee_id": employee.id, "start_date": str(WEEK), "end_date": str(WEEK + datetime.timedelta(days=6))},
    )
    app.dependency_overrides.clear()

    assert saved.status_code == 200
    assert _stored(db_session) == {(reception.constraint_group_id, WEEK, "cannot_work")}
    items = read.json()["constraints"]
    assert sorted(i["shift_id"] for i in items) == sorted([reception.id, guard.id])
    assert {i["group_id"] for i in items} == {reception.constraint_group_id}


def test_sync_by_legacy_shift_id_lands_on_the_shifts_row(client, db_session):
    """Installed mobile builds send one item per shift; both shifts of a row collapse into one row."""
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    login_as(app, admin_user())

    response = _sync(client, employee.id, [
        _item(employee.id, shift_id=reception.id),
        _item(employee.id, shift_id=guard.id),
        _item(employee.id, shift_id=evening.id),
    ])
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert _stored(db_session) == {
        (reception.constraint_group_id, WEEK, "cannot_work"), (evening.constraint_group_id, WEEK, "cannot_work"),
    }


def test_sync_rejects_conflicting_marks_on_one_row(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    login_as(app, admin_user())

    response = _sync(client, employee.id, [
        _item(employee.id, shift_id=reception.id),
        _item(employee.id, shift_id=guard.id, constraint_type="must_work"),
    ])
    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert _stored(db_session) == set()


def test_sync_rejects_a_row_of_another_location(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    elsewhere = make_shift(db_session, make_location(db_session, "Other"))
    db_session.commit()
    login_as(app, admin_user())

    by_group = _sync(client, employee.id, [_item(employee.id, group_id=elsewhere.constraint_group_id)])
    by_shift = _sync(client, employee.id, [_item(employee.id, shift_id=elsewhere.id)])
    app.dependency_overrides.clear()

    assert by_group.status_code == 400 and by_shift.status_code == 400


def test_sync_requires_a_group_or_a_shift(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    login_as(app, admin_user())

    response = _sync(client, employee.id, [_item(employee.id)])
    app.dependency_overrides.clear()

    assert response.status_code == 422


def test_sync_keeps_rows_of_groups_that_left_the_board(client, db_session):
    """A row kept as history in a group without shifts is neither returned nor deleted by a save."""
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    history = ConstraintGroup(location_id=location.id)
    db_session.add(history)
    db_session.flush()
    db_session.add(WeeklyConstraint(employee_id=employee.id, group_id=history.id, date=WEEK, constraint_type="cannot_work"))
    db_session.commit()
    login_as(app, admin_user())

    response = _sync(client, employee.id, [])
    read = client.get(
        "/api/constraints/",
        params={"employee_id": employee.id, "start_date": str(WEEK), "end_date": str(WEEK + datetime.timedelta(days=6))},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert read.json()["constraints"] == []
    assert _stored(db_session) == {(history.id, WEEK, "cannot_work")}


def test_scheduler_out_of_scope_cannot_sync(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    login_as(app, scheduler_user([]))

    response = _sync(client, employee.id, [_item(employee.id, group_id=reception.constraint_group_id)])
    app.dependency_overrides.clear()

    assert response.status_code == 403
