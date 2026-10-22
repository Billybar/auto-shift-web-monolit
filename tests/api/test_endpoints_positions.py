import datetime

from app.core.models import Assignment, EmployeePosition, Position, ShiftDemand
from main import app
from tests.factories import (
    admin_user, default_position, login_as, make_employee, make_location, make_position, make_shift, scheduler_user,
)


def test_crud_flow(client, db_session):
    location = make_location(db_session)
    db_session.commit()
    login_as(app, admin_user())

    created = client.post("/api/positions/", json={"location_id": location.id, "name": "  אחמ\"ש ", "color": "#ff0000"})
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == 'אחמ"ש'
    assert body["color"] == "FF0000"
    assert body["sort_order"] == 1, "Goes after the default role"
    assert body["is_active"] is True

    renamed = client.put(f"/api/positions/{body['id']}", json={"name": "בקר"})
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "בקר"
    assert renamed.json()["color"] == "FF0000", "Fields not sent are kept"

    archived = client.put(f"/api/positions/{body['id']}", json={"is_active": False})
    assert archived.json()["is_active"] is False

    listed = client.get("/api/positions/", params={"location_id": location.id}).json()
    assert [p["name"] for p in listed] == ["כללי"]
    listed_all = client.get("/api/positions/", params={"location_id": location.id, "include_archived": True}).json()
    assert [p["name"] for p in listed_all] == ["כללי", "בקר"]

    deleted = client.delete(f"/api/positions/{body['id']}")
    assert deleted.status_code == 204
    assert db_session.get(Position, body["id"]) is None
    app.dependency_overrides.clear()


def test_invalid_color_is_rejected(client, db_session):
    location = make_location(db_session)
    db_session.commit()
    login_as(app, admin_user())

    response = client.post("/api/positions/", json={"location_id": location.id, "name": "x", "color": "red"})
    app.dependency_overrides.clear()

    assert response.status_code == 422


def test_name_taken_returns_409(client, db_session):
    location = make_location(db_session)
    other = make_position(db_session, location, "מאבטח")
    db_session.commit()
    login_as(app, admin_user())

    duplicate = client.post("/api/positions/", json={"location_id": location.id, "name": "כללי"})
    rename = client.put(f"/api/positions/{other.id}", json={"name": "כללי"})
    app.dependency_overrides.clear()

    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "position_name_taken"
    assert rename.status_code == 409
    assert rename.json()["code"] == "position_name_taken"


def test_same_name_in_another_location_is_fine(client, db_session):
    make_location(db_session, "A")
    location_b = make_location(db_session, "B")
    db_session.commit()
    login_as(app, admin_user())

    response = client.post("/api/positions/", json={"location_id": location_b.id, "name": "מאבטח"})
    app.dependency_overrides.clear()

    assert response.status_code == 201


def test_out_of_scope_returns_404(client, db_session):
    mine = make_location(db_session, "Mine")
    theirs = make_location(db_session, "Theirs")
    db_session.commit()
    their_position = default_position(theirs)
    login_as(app, scheduler_user([mine]))

    responses = [
        client.get("/api/positions/", params={"location_id": theirs.id}),
        client.post("/api/positions/", json={"location_id": theirs.id, "name": "x"}),
        client.put(f"/api/positions/{their_position.id}", json={"name": "x"}),
        client.delete(f"/api/positions/{their_position.id}"),
    ]
    in_scope = client.get("/api/positions/", params={"location_id": mine.id})
    app.dependency_overrides.clear()

    assert [r.status_code for r in responses] == [404, 404, 404, 404]
    assert in_scope.status_code == 200


def test_delete_in_use_is_refused(client, db_session):
    location = make_location(db_session)
    position = default_position(location)
    shift = make_shift(db_session, location)
    employee = make_employee(db_session, location, [position], position)
    db_session.add(Assignment(
        location_id=location.id, employee_id=employee.id, shift_id=shift.id,
        date=datetime.date(2026, 10, 25), position_id=position.id,
    ))
    db_session.commit()
    login_as(app, admin_user())

    response = client.delete(f"/api/positions/{position.id}")
    app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.json()["code"] == "position_in_use"


def test_delete_unused_cascades_links_and_demand(client, db_session):
    location = make_location(db_session)
    guard = make_position(db_session, location, "מאבטח")
    shift = make_shift(db_session, location)
    employee = make_employee(db_session, location, [guard], guard)
    db_session.add(ShiftDemand(shift_definition_id=shift.id, day_of_week=0, position_id=guard.id, required_employees=2))
    db_session.commit()
    guard_id = guard.id
    login_as(app, admin_user())

    response = client.delete(f"/api/positions/{guard_id}")
    app.dependency_overrides.clear()

    assert response.status_code == 204
    db_session.expire_all()
    assert db_session.query(EmployeePosition).filter_by(employee_id=employee.id).count() == 0
    assert db_session.query(ShiftDemand).filter_by(position_id=guard_id).count() == 0
