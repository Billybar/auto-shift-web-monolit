import datetime
from sqlalchemy import select
from app.api.dependencies import get_current_user, get_current_admin_user, get_current_scheduler_user
from app.core.models import (
    User, Location, Organization, Client, ConstraintGroup, Employee, ShiftDefinition, WeeklyConstraint, WeeklyNote,
)
from app.services import default_constraints_service
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

    db_session.expire_all()
    week_rows = db_session.execute(select(WeeklyNote)).scalars().all()
    notes = {n.employee_id: n.note for n in week_rows if n.note is not None}
    assert notes == {emp_with_comment.id: "רוצה לפחות 3 משמרות 🙏"}
    # The import submits the week of every employee in the file, so it stops using their defaults
    assert {n.employee_id for n in week_rows if n.submitted_at} == {emp_with_comment.id, emp_cycle_only.id}

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


def _yalam_day(morning: str = "", noon: str = "", evening: str = "") -> str:
    """One day cell of the Yalam table; each state is 'cant', 'want' or ''."""
    cells = "".join(
        f'<span class="wac-cell {state}" title="{name}">{name[0]}</span>'
        for name, state in (("בוקר", morning), ("צהריים", noon), ("ערב", evening))
    )
    return f'<td title=""><div class="wac-cells">{cells}</div></td>'


def test_yalam_import_stores_cannot_work_and_prefer_to(client, db_session):
    """
    Yalam 'cant' cells become cannot_work and 'want' cells prefer_to. On a row that holds a morning and
    an evening shift, a 'want' morning and a 'cant' noon on the same day store cannot_work.
    """
    location = make_location(db_session)
    morning = make_shift(db_session, location, "בוקר", "06:45", "15:00")
    evening = make_shift(db_session, location, "ערב", "14:45", "23:00")
    single = make_shift(db_session, location, "בוקר נפרד", "08:00", "16:00")
    old_evening_group = evening.constraint_group
    evening.constraint_group = morning.constraint_group
    db_session.delete(old_evening_group)
    employee = make_employee(db_session, location)
    employee.yalam_id = "108520"
    db_session.commit()
    login_as(app, admin_user())

    days = [_yalam_day() for _ in range(7)]
    days[0] = _yalam_day(morning="want", noon="cant")
    days[1] = _yalam_day(noon="want")
    days[2] = _yalam_day(morning="cant")
    html_content = (
        '<table class="wac-table"><tbody><tr><td class="wac-emp-col">'
        '<span class="wac-name">בילי</span><span class="wac-code">108520</span></td>'
        + "".join(days) + "</tr></tbody></table>"
    )

    response = client.post(
        "/api/constraints/import-html",
        data={"source": "yalam", "start_of_week": str(WEEK), "location_id": str(location.id)},
        files={"file": ("constraints.html", html_content.encode("utf-8"), "text/html")},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    mixed, alone = morning.constraint_group_id, single.constraint_group_id
    monday, tuesday = WEEK + datetime.timedelta(days=1), WEEK + datetime.timedelta(days=2)
    assert _stored(db_session) == {
        (mixed, WEEK, "cannot_work"), (alone, WEEK, "prefer_to"),
        (mixed, monday, "prefer_to"),
        (mixed, tuesday, "cannot_work"), (alone, tuesday, "cannot_work"),
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


def test_scheduler_in_scope_can_sync_must_work(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    login_as(app, scheduler_user([location]))

    response = _sync(client, employee.id, [
        _item(employee.id, group_id=reception.constraint_group_id, constraint_type="must_work"),
    ])
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert _stored(db_session) == {(reception.constraint_group_id, WEEK, "must_work")}


def test_manager_in_scope_can_sync_must_work(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    manager = User(id=903, email="manager@test.com", role="manager")
    manager.locations = [location]
    login_as(app, manager)

    response = _sync(client, employee.id, [
        _item(employee.id, group_id=evening.constraint_group_id, constraint_type="must_work"),
    ])
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert _stored(db_session) == {(evening.constraint_group_id, WEEK, "must_work")}


def test_employee_cannot_add_must_work(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    login_as(app, User(id=902, email="employee@test.com", role="employee", employee_id=employee.id))

    response = _sync(client, employee.id, [
        _item(employee.id, group_id=reception.constraint_group_id, constraint_type="must_work"),
    ])
    app.dependency_overrides.clear()

    assert response.status_code == 403
    assert _stored(db_session) == set()


def test_employee_keeps_a_managers_must_work_when_saving(client, db_session):
    """Saving sends the whole week back, so a must_work a manager set is resent as-is and accepted."""
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    db_session.add(WeeklyConstraint(
        employee_id=employee.id, group_id=reception.constraint_group_id, date=WEEK, constraint_type="must_work",
    ))
    db_session.commit()
    login_as(app, User(id=902, email="employee@test.com", role="employee", employee_id=employee.id))

    response = _sync(client, employee.id, [
        _item(employee.id, group_id=reception.constraint_group_id, constraint_type="must_work"),
        _item(employee.id, group_id=evening.constraint_group_id, constraint_type="cannot_work"),
    ])
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert _stored(db_session) == {
        (reception.constraint_group_id, WEEK, "must_work"), (evening.constraint_group_id, WEEK, "cannot_work"),
    }


def test_employee_can_sync_prefer_to_and_reads_it_back_per_shift(client, db_session):
    """prefer_to is a soft wish, so (unlike must_work) an employee may set it on their own board."""
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    login_as(app, User(id=902, email="employee@test.com", role="employee", employee_id=employee.id))

    saved = _sync(client, employee.id, [
        _item(employee.id, group_id=reception.constraint_group_id, constraint_type="prefer_to"),
    ])
    read = client.get(
        "/api/constraints/",
        params={"employee_id": employee.id, "start_date": str(WEEK), "end_date": str(WEEK + datetime.timedelta(days=6))},
    )
    app.dependency_overrides.clear()

    assert saved.status_code == 200
    assert _stored(db_session) == {(reception.constraint_group_id, WEEK, "prefer_to")}
    items = read.json()["constraints"]
    assert sorted(i["shift_id"] for i in items) == sorted([reception.id, guard.id])
    assert {i["constraint_type"] for i in items} == {"prefer_to"}


# --- Default constraints (the employee's default week) ---

def _future_week() -> datetime.date:
    """A Sunday whose week hasn't ended, so an unsubmitted week uses the defaults."""
    today = datetime.date.today()
    return today + datetime.timedelta(days=7 - (today.weekday() + 1) % 7)


def _week_params(employee_id, week):
    return {"employee_id": employee_id, "start_date": str(week), "end_date": str(week + datetime.timedelta(days=6))}


def _put_defaults(client, employee_id, items):
    return client.put("/api/constraints/defaults", params={"employee_id": employee_id}, json={"constraints": items})


def _default(group_id, day_of_week, constraint_type="cannot_work"):
    return {"group_id": group_id, "day_of_week": day_of_week, "constraint_type": constraint_type}


def _as_employee(employee):
    return User(id=902, email="employee@test.com", role="employee", employee_id=employee.id)


def test_defaults_round_trip_and_replace(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    login_as(app, _as_employee(employee))

    first = _put_defaults(client, employee.id, [
        _default(reception.constraint_group_id, 0), _default(evening.constraint_group_id, 5, "prefer_to"),
    ])
    second = _put_defaults(client, employee.id, [_default(evening.constraint_group_id, 5, "cannot_work")])
    read = client.get("/api/constraints/defaults", params={"employee_id": employee.id})
    app.dependency_overrides.clear()

    assert first.status_code == 200 and len(first.json()["constraints"]) == 2
    assert second.status_code == 200
    assert read.json() == {
        "employee_id": employee.id,
        "constraints": [_default(evening.constraint_group_id, 5, "cannot_work")],
    }


def test_defaults_refusals(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    other = make_employee(db_session, location)
    elsewhere = make_shift(db_session, make_location(db_session, "Other"))
    db_session.commit()
    login_as(app, _as_employee(employee))

    must_work = _put_defaults(client, employee.id, [_default(reception.constraint_group_id, 0, "must_work")])
    foreign_group = _put_defaults(client, employee.id, [_default(elsewhere.constraint_group_id, 0)])
    bad_day = _put_defaults(client, employee.id, [_default(reception.constraint_group_id, 7)])
    someone_else = client.get("/api/constraints/defaults", params={"employee_id": other.id})
    app.dependency_overrides.clear()

    assert must_work.status_code == 403
    assert foreign_group.status_code == 400
    assert bad_day.status_code == 422
    assert someone_else.status_code == 403


def test_employee_keeps_a_managers_default_must_work(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    manager = User(id=903, email="manager@test.com", role="manager")
    manager.locations = [location]
    login_as(app, manager)
    by_manager = _put_defaults(client, employee.id, [_default(reception.constraint_group_id, 0, "must_work")])

    login_as(app, _as_employee(employee))
    week = _future_week()
    resent = _put_defaults(client, employee.id, [
        _default(reception.constraint_group_id, 0, "must_work"), _default(evening.constraint_group_id, 1),
    ])
    # The week shows the default must_work, and saving it back as loaded is accepted
    saved_week = _sync_week(client, employee.id, week, [
        _item(employee.id, week, "must_work", group_id=reception.constraint_group_id),
    ])
    app.dependency_overrides.clear()

    assert by_manager.status_code == 200
    assert resent.status_code == 200
    assert saved_week.status_code == 200, saved_week.text


def _sync_week(client, employee_id, week, constraints, note=None):
    body = {"constraints": constraints}
    if note is not None:
        body["note"] = note
    return client.post("/api/constraints/sync", params=_week_params(employee_id, week), json=body)


def test_unsubmitted_week_shows_the_defaults_until_saved(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    week = _future_week()
    login_as(app, _as_employee(employee))

    _put_defaults(client, employee.id, [_default(reception.constraint_group_id, 1)])
    before = client.get("/api/constraints/", params=_week_params(employee.id, week)).json()
    saved = _sync_week(client, employee.id, week, [])
    after = client.get("/api/constraints/", params=_week_params(employee.id, week)).json()
    app.dependency_overrides.clear()

    monday = str(week + datetime.timedelta(days=1))
    assert before["uses_defaults"] is True
    # One item per shift of the row, with no stored id
    assert sorted(i["shift_id"] for i in before["constraints"]) == sorted([reception.id, guard.id])
    assert {(i["date"], i["id"], i["group_id"]) for i in before["constraints"]} == {
        (monday, None, reception.constraint_group_id),
    }
    assert saved.status_code == 200
    assert after == {"constraints": [], "note": None, "uses_defaults": False}
    assert _stored(db_session) == set()


def test_a_week_with_saved_rows_ignores_the_defaults(client, db_session):
    """Rows written without a marker (legacy weeks, seeds) still decide the week."""
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    week = _future_week()
    db_session.add(WeeklyConstraint(
        employee_id=employee.id, group_id=evening.constraint_group_id, date=week, constraint_type="prefer_to",
    ))
    db_session.commit()
    login_as(app, admin_user())

    _put_defaults(client, employee.id, [_default(reception.constraint_group_id, 1)])
    read = client.get("/api/constraints/", params=_week_params(employee.id, week)).json()
    app.dependency_overrides.clear()

    assert read["uses_defaults"] is False
    assert [(i["group_id"], i["constraint_type"]) for i in read["constraints"]] == [
        (evening.constraint_group_id, "prefer_to"),
    ]


def test_a_past_week_never_uses_the_defaults(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    login_as(app, admin_user())

    _put_defaults(client, employee.id, [_default(reception.constraint_group_id, 1)])
    read = client.get("/api/constraints/", params=_week_params(employee.id, WEEK)).json()
    app.dependency_overrides.clear()

    assert read == {"constraints": [], "note": None, "uses_defaults": False}


def test_saving_a_note_submits_the_week_and_keeps_the_note(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    week = _future_week()
    login_as(app, _as_employee(employee))

    _put_defaults(client, employee.id, [_default(reception.constraint_group_id, 1)])
    _sync_week(client, employee.id, week, [], note="חופש")
    # A later save without a note leaves the note as it is
    _sync_week(client, employee.id, week, [])
    read = client.get("/api/constraints/", params=_week_params(employee.id, week)).json()
    app.dependency_overrides.clear()

    assert read == {"constraints": [], "note": "חופש", "uses_defaults": False}


# --- Submission status (who still shows their defaults) ---

def _status(client, location_id, week):
    return client.get(
        "/api/constraints/submission-status", params={"location_id": location_id, "week_start": str(week)}
    )


def test_submission_status_lists_employees_until_they_save(client, db_session):
    """Empty and non-empty defaults both count as not submitted; saving (even an empty week) submits."""
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    with_defaults = make_employee(db_session, location)
    saver = make_employee(db_session, location)
    inactive = make_employee(db_session, location)
    inactive.is_active = False
    db_session.commit()
    week = _future_week()
    login_as(app, scheduler_user([location]))

    _put_defaults(client, with_defaults.id, [_default(reception.constraint_group_id, 1)])
    before = _status(client, location.id, week)
    _sync_week(client, saver.id, week, [])
    # Any date of the week names the week
    after = _status(client, location.id, week + datetime.timedelta(days=3))
    app.dependency_overrides.clear()

    assert before.status_code == 200
    assert before.json() == {
        "week_start": str(week), "pending_employee_ids": sorted([employee.id, with_defaults.id, saver.id]),
    }
    assert after.json() == {"week_start": str(week), "pending_employee_ids": sorted([employee.id, with_defaults.id])}


def test_submission_status_counts_saved_rows_as_submitted(client, db_session):
    """Rows written without a marker (legacy weeks, seeds) decide the week."""
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    week = _future_week()
    db_session.add(WeeklyConstraint(
        employee_id=employee.id, group_id=evening.constraint_group_id, date=week, constraint_type="prefer_to",
    ))
    db_session.commit()
    login_as(app, admin_user())

    response = _status(client, location.id, week)
    app.dependency_overrides.clear()

    assert response.json()["pending_employee_ids"] == []


def test_submission_status_is_empty_after_publishing_and_for_past_weeks(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    week = _future_week()
    default_constraints_service.freeze_week(db_session, location.id, week)
    db_session.commit()
    login_as(app, admin_user())

    published = _status(client, location.id, week)
    past = _status(client, location.id, WEEK)
    app.dependency_overrides.clear()

    assert published.json()["pending_employee_ids"] == []
    assert past.json() == {"week_start": str(WEEK), "pending_employee_ids": []}


def test_submission_status_refusals(client, db_session):
    location, reception, guard, evening, employee = _twin_mornings(db_session)
    week = _future_week()

    login_as(app, scheduler_user([]))
    out_of_scope = _status(client, location.id, week)
    app.dependency_overrides.clear()
    # Only get_current_user is overridden, so the real scheduler guard runs
    app.dependency_overrides[get_current_user] = lambda: _as_employee(employee)
    as_employee = _status(client, location.id, week)
    app.dependency_overrides.clear()

    assert out_of_scope.status_code == 404
    assert as_employee.status_code == 403
