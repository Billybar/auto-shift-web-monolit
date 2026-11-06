# tests/api/test_endpoints_demo.py
from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from app.api import endpoints_demo
from app.core import config
from app.core.database import Base
from app.core.enums import ConstraintType, RoleEnum
from app.core.models import (
    Assignment, Employee, EmployeeDefaultConstraint, Organization, ShiftDefinition, User, WeeklyConstraint,
)
from app.services import demo_service
from app.services.auth_service import issue_token
from app.services.demo_service import _upcoming_sunday
from app.services.weekly_schedule_service import generate_weekly_schedule
from tests.factories import make_location


@pytest.fixture
def demo_on(monkeypatch):
    """Turns demo mode on with a fresh per-IP rate limit."""
    monkeypatch.setattr(config, "DEMO_MODE", True)
    endpoints_demo._sessions_by_ip.clear()
    yield
    endpoints_demo._sessions_by_ip.clear()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _start(client) -> str:
    response = client.post("/api/demo/session")
    assert response.status_code == 201, response.text
    return response.json()["access_token"]


def _me(client, token: str) -> dict:
    response = client.get("/api/users/me", headers=_auth(token))
    assert response.status_code == 200, response.text
    return response.json()


def test_demo_is_off_by_default(client):
    """On a regular instance the demo is hidden and no sandbox can be created."""
    assert client.get("/api/demo/status").json()["enabled"] is False
    assert client.post("/api/demo/session").status_code == 404


def test_session_creates_a_seeded_sandbox(client, db_session, demo_on):
    """A visitor gets a manager scoped to one new location with shifts, employees and constraints."""
    assert client.get("/api/demo/status").json()["enabled"] is True

    me = _me(client, _start(client))

    assert me["role"] == RoleEnum.MANAGER.value
    assert len(me["locations"]) == 1
    location_id = me["locations"][0]["id"]
    shifts = db_session.execute(select(ShiftDefinition).where(ShiftDefinition.location_id == location_id)).scalars().all()
    assert len(shifts) == 3
    employee_ids = db_session.execute(select(Employee.id).where(Employee.location_id == location_id)).scalars().all()
    # The employees, plus the manager, who works shifts too
    assert len(employee_ids) == len(demo_service._EMPLOYEES) + 1
    assert me["employee_id"] in employee_ids
    week_start = _upcoming_sunday(date.today())
    week_constraints = db_session.execute(
        select(WeeklyConstraint).where(WeeklyConstraint.employee_id.in_(employee_ids), WeeklyConstraint.date >= week_start)
    ).scalars().all()
    assert {c.constraint_type for c in week_constraints} == {
        ConstraintType.CANNOT_WORK, ConstraintType.PREFER_TO, ConstraintType.MUST_WORK,
    }
    # Both demo views (the manager and the first employee) have a default week
    with_defaults = set(db_session.execute(
        select(EmployeeDefaultConstraint.employee_id).where(EmployeeDefaultConstraint.employee_id.in_(employee_ids))
    ).scalars().all())
    assert me["employee_id"] in with_defaults and len(with_defaults) == 2


def test_manager_has_own_constraints(client, demo_on):
    """The manager is also an employee, so their constraints board has next week's marks."""
    token = _start(client)
    me = _me(client, token)
    week_start = _upcoming_sunday(date.today())

    response = client.get("/api/constraints/", headers=_auth(token), params={
        "employee_id": me["employee_id"],
        "start_date": week_start.isoformat(),
        "end_date": (week_start + timedelta(days=6)).isoformat(),
    })

    assert response.status_code == 200, response.text
    assert response.json()["constraints"]


def _save_own_week_as_loaded(client, token: str) -> tuple:
    """Loads the user's own board for the opening week and saves it back unchanged, like the web board."""
    me = _me(client, token)
    week_start = _upcoming_sunday(date.today())
    params = {
        "employee_id": me["employee_id"],
        "start_date": week_start.isoformat(),
        "end_date": (week_start + timedelta(days=6)).isoformat(),
    }
    loaded = client.get("/api/constraints/", headers=_auth(token), params=params).json()["constraints"]
    # The API returns a mark once per shift of its row; the board keeps one per row and date
    marks = {(c["group_id"], c["date"]): c["constraint_type"] for c in loaded}
    payload = [
        {"employee_id": me["employee_id"], "group_id": group_id, "date": on_date, "constraint_type": c_type}
        for (group_id, on_date), c_type in marks.items()
    ]
    response = client.post("/api/constraints/sync", headers=_auth(token), params=params, json={"constraints": payload})
    return response, set(marks.values())


def test_manager_and_employee_can_save_their_seeded_boards(client, demo_on):
    """
    Both demo views open on a board seeded with a must_work (the manager is the 13th employee, the
    employee view the 1st), and both can save it as loaded.
    """
    manager_token = _start(client)
    saved, types = _save_own_week_as_loaded(client, manager_token)
    assert saved.status_code == 200, saved.text
    assert "must_work" in types

    switched = client.post("/api/demo/switch", json={"role": "employee"}, headers=_auth(manager_token))
    saved, types = _save_own_week_as_loaded(client, switched.json()["access_token"])
    assert saved.status_code == 200, saved.text
    assert "must_work" in types


def test_sandboxes_are_isolated(client, demo_on):
    """One visitor can't see another visitor's location (404, IDOR-safe)."""
    token_a, token_b = _start(client), _start(client)
    location_b = _me(client, token_b)["locations"][0]["id"]

    response = client.get(f"/api/shift-definitions/?location_id={location_b}", headers=_auth(token_a))
    assert response.status_code == 404
    response = client.get(f"/api/employees/?location_id={location_b}", headers=_auth(token_a))
    assert response.json() == []


def test_switch_role_stays_inside_the_sandbox(client, db_session, demo_on):
    manager_token = _start(client)
    manager = _me(client, manager_token)

    response = client.post("/api/demo/switch", json={"role": "employee"}, headers=_auth(manager_token))
    assert response.status_code == 200
    employee = _me(client, response.json()["access_token"])
    assert employee["role"] == RoleEnum.EMPLOYEE.value
    assert employee["organization_id"] == manager["organization_id"]

    response = client.post("/api/demo/switch", json={"role": "manager"}, headers=_auth(response.json()["access_token"]))
    assert _me(client, response.json()["access_token"])["id"] == manager["id"]


def test_switch_role_refuses_users_outside_a_sandbox(client, db_session, demo_on):
    location = make_location(db_session, "Real")
    user = User(
        email="real@example.com", first_name="Real", last_name="User", hashed_password="x",
        role=RoleEnum.MANAGER, organization_id=location.client.organization_id,
    )
    db_session.add(user)
    db_session.commit()
    token = issue_token(user)["access_token"]

    response = client.post("/api/demo/switch", json={"role": "employee"}, headers=_auth(token))
    assert response.status_code == 404


def test_session_is_rate_limited_per_ip(client, demo_on, monkeypatch):
    monkeypatch.setattr(config, "DEMO_MAX_SANDBOXES_PER_IP_PER_HOUR", 2)
    _start(client)
    _start(client)

    response = client.post("/api/demo/session")
    assert response.status_code == 429
    assert response.json()["code"] == "demo_limit_reached"


def test_session_limit_counts_the_ip_from_the_proxy_header(client, demo_on, monkeypatch):
    """Behind Cloudflare every request comes from the tunnel; the limit goes by CF-Connecting-IP."""
    monkeypatch.setattr(config, "DEMO_MAX_SANDBOXES_PER_IP_PER_HOUR", 1)
    monkeypatch.setattr(config, "DEMO_CLIENT_IP_HEADER", "CF-Connecting-IP")
    visitor_a, visitor_b = {"CF-Connecting-IP": "203.0.113.1"}, {"CF-Connecting-IP": "203.0.113.2"}

    assert client.post("/api/demo/session", headers=visitor_a).status_code == 201
    assert client.post("/api/demo/session", headers=visitor_b).status_code == 201
    assert client.post("/api/demo/session", headers=visitor_a).status_code == 429


def test_session_respects_the_global_cap(client, demo_on, monkeypatch):
    monkeypatch.setattr(config, "DEMO_MAX_ACTIVE_SANDBOXES", 1)
    _start(client)

    response = client.post("/api/demo/session")
    assert response.status_code == 429
    assert response.json()["code"] == "demo_limit_reached"


def _row_counts(db) -> dict:
    return {table.name: db.execute(select(func.count()).select_from(table)).scalar_one() for table in Base.metadata.sorted_tables}


def test_purge_deletes_every_row_of_expired_sandboxes(client, db_session, demo_on, monkeypatch):
    """Cleanup leaves nothing behind, including what the visitor added (assignments)."""
    token = _start(client)
    location_id = _me(client, token)["locations"][0]["id"]
    employee = db_session.execute(select(Employee).where(Employee.location_id == location_id).limit(1)).scalar_one()
    shift = db_session.execute(select(ShiftDefinition).where(ShiftDefinition.location_id == location_id).limit(1)).scalar_one()
    db_session.add(Assignment(
        location_id=location_id, employee_id=employee.id, shift_id=shift.id,
        date=_upcoming_sunday(date.today()),
        position_id=employee.position_links[0].position_id,
    ))
    db_session.commit()

    # Not expired yet: nothing is deleted
    assert demo_service.purge_expired(db_session) == 0

    monkeypatch.setattr(config, "DEMO_SANDBOX_TTL_HOURS", 0)
    assert demo_service.purge_expired(db_session) == 1
    assert all(count == 0 for count in _row_counts(db_session).values()), _row_counts(db_session)


def test_purge_keeps_other_organizations(client, db_session, demo_on, monkeypatch):
    make_location(db_session, "Real")
    db_session.add(User(
        email="real@example.com", first_name="Real", last_name="User", hashed_password="x",
        role=RoleEnum.MANAGER,
        organization_id=db_session.execute(select(Organization.id)).scalar_one(),
    ))
    db_session.commit()
    _start(client)

    monkeypatch.setattr(config, "DEMO_SANDBOX_TTL_HOURS", 0)
    assert demo_service.purge_expired(db_session) == 1
    assert db_session.execute(select(Organization.name)).scalars().all() == ["Real Org"]


def test_fresh_sandbox_gets_a_full_schedule(db_session):
    """The seeded week solves with every slot filled and no ignored inputs."""
    manager = demo_service.create_sandbox(db_session)
    location_id = manager.locations[0].id

    result = generate_weekly_schedule(db_session, location_id, _upcoming_sunday(date.today()))

    assert result.status in ("OPTIMAL", "FEASIBLE")
    assert result.unfilled_slots == []
    assert result.warnings == []
