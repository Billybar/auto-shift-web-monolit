"""Constraints-board rows (groups): listing, rename, merge and split, keeping every submitted constraint."""
import datetime

from sqlalchemy import select

from app.core.enums import ConstraintType
from app.core.models import ConstraintGroup, ShiftDefinition, WeeklyConstraint
from main import app
from tests.factories import admin_user, login_as, make_employee, make_location, make_shift, scheduler_user

SUNDAY = datetime.date(2026, 10, 25)
MONDAY = SUNDAY + datetime.timedelta(days=1)


def _mark(db, employee, shift, on_date, constraint_type=ConstraintType.CANNOT_WORK):
    db.add(WeeklyConstraint(
        employee_id=employee.id, group_id=shift.constraint_group_id, date=on_date, constraint_type=constraint_type,
    ))


def _rows(db):
    db.expire_all()
    rows = db.execute(select(WeeklyConstraint)).scalars().all()
    return {(r.employee_id, r.group_id, r.date, r.constraint_type) for r in rows}


def test_new_shifts_get_their_own_rows_listed_in_work_day_order(client, db_session):
    location = make_location(db_session)
    night = make_shift(db_session, location, "לילה", "22:45", "07:00")
    morning = make_shift(db_session, location, "בוקר", "06:45", "15:00")
    db_session.commit()
    login_as(app, admin_user())

    created = client.post(
        "/api/shift-definitions/",
        json={"location_id": location.id, "name": "ערב", "start_time": "14:45", "end_time": "23:00"},
    )
    listed = client.get("/api/constraint-groups/", params={"location_id": location.id})
    app.dependency_overrides.clear()

    assert created.status_code == 201
    evening_group = created.json()["constraint_group_id"]
    assert [(g["id"], g["shift_ids"], g["name"]) for g in listed.json()] == [
        (morning.constraint_group_id, [morning.id], None),
        (evening_group, [created.json()["id"]], None),
        (night.constraint_group_id, [night.id], None),
    ]


def test_rename_and_clear_the_name(client, db_session):
    location = make_location(db_session)
    morning = make_shift(db_session, location)
    db_session.commit()
    login_as(app, admin_user())

    named = client.put(f"/api/constraint-groups/{morning.constraint_group_id}", json={"name": "  בוקר  "})
    cleared = client.put(f"/api/constraint-groups/{morning.constraint_group_id}", json={"name": ""})
    app.dependency_overrides.clear()

    assert named.status_code == 200 and named.json()["name"] == "בוקר"
    assert cleared.status_code == 200 and cleared.json()["name"] is None


def test_merge_moves_shifts_and_rows_and_keeps_conflicts_as_history(client, db_session):
    location = make_location(db_session)
    reception = make_shift(db_session, location, "בוקר קבלה", "06:45", "15:00")
    guard = make_shift(db_session, location, "בוקר מאבטח", "06:45", "15:00")
    employee = make_employee(db_session, location)
    target, source = reception.constraint_group_id, guard.constraint_group_id
    # Sunday: both rows marked (conflict, the target wins); Monday: only the source
    _mark(db_session, employee, reception, SUNDAY)
    _mark(db_session, employee, guard, SUNDAY, ConstraintType.MUST_WORK)
    _mark(db_session, employee, guard, MONDAY)
    db_session.commit()
    login_as(app, admin_user())

    response = client.post(f"/api/constraint-groups/{target}/merge", json={"source_group_id": source})
    listed = client.get("/api/constraint-groups/", params={"location_id": location.id})
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert (body["moved"], body["conflicts"]) == (1, 1)
    assert sorted(body["group"]["shift_ids"]) == sorted([reception.id, guard.id])
    assert [g["id"] for g in listed.json()] == [target]
    assert _rows(db_session) == {
        (employee.id, target, SUNDAY, ConstraintType.CANNOT_WORK),
        (employee.id, target, MONDAY, ConstraintType.CANNOT_WORK),
        # Kept in the emptied source group, which stays because of it
        (employee.id, source, SUNDAY, ConstraintType.MUST_WORK),
    }
    assert db_session.get(ConstraintGroup, source) is not None


def test_merge_without_conflicts_deletes_the_emptied_group(client, db_session):
    location = make_location(db_session)
    reception = make_shift(db_session, location, "בוקר קבלה", "06:45", "15:00")
    guard = make_shift(db_session, location, "בוקר מאבטח", "06:45", "15:00")
    employee = make_employee(db_session, location)
    target, source = reception.constraint_group_id, guard.constraint_group_id
    _mark(db_session, employee, guard, SUNDAY)
    db_session.commit()
    login_as(app, admin_user())

    response = client.post(f"/api/constraint-groups/{target}/merge", json={"source_group_id": source})
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert (response.json()["moved"], response.json()["conflicts"]) == (1, 0)
    assert db_session.get(ConstraintGroup, source) is None
    assert _rows(db_session) == {(employee.id, target, SUNDAY, ConstraintType.CANNOT_WORK)}


def test_split_copies_the_rows_to_the_new_row(client, db_session):
    location = make_location(db_session)
    reception = make_shift(db_session, location, "בוקר קבלה", "06:45", "15:00")
    guard = make_shift(db_session, location, "בוקר מאבטח", "06:45", "15:00")
    employee = make_employee(db_session, location)
    merged = reception.constraint_group_id
    old = guard.constraint_group
    guard.constraint_group = reception.constraint_group
    db_session.delete(old)
    _mark(db_session, employee, reception, SUNDAY)
    db_session.commit()
    login_as(app, admin_user())

    response = client.post(f"/api/constraint-groups/{merged}/split", json={"shift_id": guard.id})
    single = client.post(f"/api/constraint-groups/{merged}/split", json={"shift_id": reception.id})
    app.dependency_overrides.clear()

    assert response.status_code == 200
    new_group = response.json()["id"]
    assert response.json()["shift_ids"] == [guard.id]
    assert db_session.get(ShiftDefinition, guard.id).constraint_group_id == new_group
    assert _rows(db_session) == {
        (employee.id, merged, SUNDAY, ConstraintType.CANNOT_WORK),
        (employee.id, new_group, SUNDAY, ConstraintType.CANNOT_WORK),
    }
    # What's left is a row with one shift
    assert single.status_code == 400


def test_merge_across_locations_is_refused(client, db_session):
    here = make_shift(db_session, make_location(db_session, "Here"))
    there = make_shift(db_session, make_location(db_session, "There"))
    db_session.commit()
    login_as(app, admin_user())

    response = client.post(
        f"/api/constraint-groups/{here.constraint_group_id}/merge", json={"source_group_id": there.constraint_group_id},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 400


def test_out_of_scope_rows_are_not_found(client, db_session):
    mine_location = make_location(db_session, "Mine")
    mine = make_shift(db_session, mine_location)
    theirs = make_shift(db_session, make_location(db_session, "Theirs"))
    db_session.commit()
    login_as(app, scheduler_user([mine_location]))

    rename = client.put(f"/api/constraint-groups/{theirs.constraint_group_id}", json={"name": "x"})
    merge = client.post(
        f"/api/constraint-groups/{mine.constraint_group_id}/merge", json={"source_group_id": theirs.constraint_group_id},
    )
    listed = client.get("/api/constraint-groups/", params={"location_id": theirs.location_id})
    app.dependency_overrides.clear()

    assert rename.status_code == 404 and merge.status_code == 404 and listed.status_code == 404


def test_deleting_a_shift_drops_its_unused_row_and_keeps_one_with_history(client, db_session):
    location = make_location(db_session)
    unused = make_shift(db_session, location, "ערב", "15:00", "23:00")
    marked = make_shift(db_session, location, "לילה", "23:00", "07:00")
    employee = make_employee(db_session, location)
    _mark(db_session, employee, marked, SUNDAY)
    unused_group, marked_group = unused.constraint_group_id, marked.constraint_group_id
    db_session.commit()
    login_as(app, admin_user())

    first = client.delete(f"/api/shift-definitions/{unused.id}")
    second = client.delete(f"/api/shift-definitions/{marked.id}")
    app.dependency_overrides.clear()

    assert first.status_code == 204 and second.status_code == 204
    db_session.expire_all()
    assert db_session.get(ConstraintGroup, unused_group) is None
    assert db_session.get(ConstraintGroup, marked_group) is not None
    assert _rows(db_session) == {(employee.id, marked_group, SUNDAY, ConstraintType.CANNOT_WORK)}
