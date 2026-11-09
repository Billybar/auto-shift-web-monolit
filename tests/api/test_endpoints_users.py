# tests/api/test_endpoints_users.py
from datetime import date
from typing import Optional, Tuple

import pytest
from sqlalchemy import func, select

from app.api.dependencies import get_current_admin_user, get_current_manager_user
from app.core.enums import RoleEnum
from app.core.models import (
    Client,
    Employee,
    Location,
    Organization,
    ScheduleWeek,
    User,
    user_clients_association,
    user_locations_association,
)
from app.core.security import get_password_hash, verify_password
from main import app

PASSWORD = "initial-pass-1"


def _override_admin() -> None:
    admin = User(email="admin@example.com", first_name="A", last_name="D", role=RoleEnum.ADMIN)
    app.dependency_overrides[get_current_admin_user] = lambda: admin
    app.dependency_overrides[get_current_manager_user] = lambda: admin


def _hierarchy(db_session, name: str = "Org") -> Tuple[Organization, Client, Location]:
    organization = Organization(name=name)
    db_session.add(organization)
    db_session.flush()
    customer = Client(name=f"{name} client", organization_id=organization.id)
    db_session.add(customer)
    db_session.flush()
    location = Location(name=f"{name} site", client_id=customer.id)
    db_session.add(location)
    db_session.commit()
    return organization, customer, location


def _payload(
    email: str = "new@example.com",
    role: str = "manager",
    organization_id: Optional[int] = None,
    client_ids: Optional[list] = None,
    location_ids: Optional[list] = None,
    password: str = PASSWORD,
) -> dict:
    return {
        "email": email,
        "first_name": "New",
        "last_name": "User",
        "password": password,
        "role": role,
        "organization_id": organization_id,
        "client_ids": client_ids or [],
        "location_ids": location_ids or [],
    }


def test_create_manager_saves_scope_and_can_log_in(client, db_session):
    _override_admin()
    organization, customer, location = _hierarchy(db_session)

    response = client.post("/api/users/", json=_payload(
        organization_id=organization.id, client_ids=[customer.id], location_ids=[location.id],
    ))

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["role"] == "manager"
    assert body["organization_id"] == organization.id
    assert [c["id"] for c in body["clients"]] == [customer.id]
    assert [l["id"] for l in body["locations"]] == [location.id]
    assert "password" not in body and "hashed_password" not in body

    saved = db_session.query(User).filter(User.email == "new@example.com").one()
    assert saved.hashed_password != PASSWORD
    assert verify_password(PASSWORD, saved.hashed_password)

    login = client.post("/api/auth/login", data={"username": "new@example.com", "password": PASSWORD})
    assert login.status_code == 200, login.text


def test_create_global_admin(client, db_session):
    _override_admin()

    response = client.post("/api/users/", json=_payload(role="admin"))

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["role"] == "admin"
    assert body["organization_id"] is None
    assert body["clients"] == [] and body["locations"] == []


def test_admin_with_scope_is_refused(client, db_session):
    _override_admin()
    organization, _, _ = _hierarchy(db_session)

    response = client.post("/api/users/", json=_payload(role="admin", organization_id=organization.id))

    assert response.status_code == 400
    assert response.json()["code"] == "user_scope_invalid"


@pytest.mark.parametrize("duplicate", ["new@example.com", "NEW@Example.COM"])
def test_duplicate_email_is_refused(client, db_session, duplicate):
    _override_admin()
    assert client.post("/api/users/", json=_payload(role="admin")).status_code == 201

    response = client.post("/api/users/", json=_payload(email=duplicate, role="admin"))

    assert response.status_code == 409
    assert response.json()["code"] == "email_taken"


def test_employee_role_is_refused(client, db_session):
    _override_admin()
    assert client.post("/api/users/", json=_payload(role="employee")).status_code == 422


def test_short_password_is_refused(client, db_session):
    _override_admin()
    assert client.post("/api/users/", json=_payload(role="admin", password="short")).status_code == 422


def test_manager_without_organization_is_refused(client, db_session):
    _override_admin()
    _, customer, _ = _hierarchy(db_session)

    response = client.post("/api/users/", json=_payload(client_ids=[customer.id]))

    assert response.status_code == 400
    assert response.json()["code"] == "user_scope_invalid"


def test_manager_without_client_or_location_is_refused(client, db_session):
    _override_admin()
    organization, _, _ = _hierarchy(db_session)

    response = client.post("/api/users/", json=_payload(organization_id=organization.id))

    assert response.status_code == 400
    assert response.json()["code"] == "user_scope_invalid"


def test_client_from_another_organization_is_refused(client, db_session):
    _override_admin()
    organization, _, _ = _hierarchy(db_session, "First")
    _, other_client, _ = _hierarchy(db_session, "Second")

    response = client.post("/api/users/", json=_payload(
        organization_id=organization.id, client_ids=[other_client.id],
    ))

    assert response.status_code == 400
    assert response.json()["code"] == "user_scope_invalid"


def test_location_from_another_organization_is_refused(client, db_session):
    _override_admin()
    organization, _, _ = _hierarchy(db_session, "First")
    _, _, other_location = _hierarchy(db_session, "Second")

    response = client.post("/api/users/", json=_payload(
        organization_id=organization.id, location_ids=[other_location.id],
    ))

    assert response.status_code == 400
    assert response.json()["code"] == "user_scope_invalid"


def test_create_requires_a_token(client, db_session):
    assert client.post("/api/users/", json=_payload(role="admin")).status_code == 401


def test_manager_cannot_create_users(client, db_session):
    organization, customer, _ = _hierarchy(db_session)
    db_session.add(User(
        email="manager@example.com", first_name="M", last_name="G", role=RoleEnum.MANAGER,
        hashed_password=get_password_hash(PASSWORD), organization_id=organization.id, clients=[customer],
    ))
    db_session.commit()
    token = client.post(
        "/api/auth/login", data={"username": "manager@example.com", "password": PASSWORD}
    ).json()["access_token"]

    response = client.post(
        "/api/users/", json=_payload(role="admin"), headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 403


def test_staff_only_leaves_out_employees(client, db_session):
    _override_admin()
    _, _, location = _hierarchy(db_session)
    employee = Employee(location_id=location.id)
    db_session.add(employee)
    db_session.flush()
    db_session.add_all([
        User(email="emp@example.com", first_name="E", last_name="M", role=RoleEnum.EMPLOYEE,
             hashed_password="x", employee_id=employee.id),
        User(email="sched@example.com", first_name="S", last_name="C", role=RoleEnum.SCHEDULER,
             hashed_password="x"),
    ])
    db_session.commit()

    staff = client.get("/api/users/", params={"staff_only": True})
    everyone = client.get("/api/users/")

    assert staff.status_code == 200, staff.text
    assert [u["email"] for u in staff.json()] == ["sched@example.com"]
    assert {u["email"] for u in everyone.json()} == {"emp@example.com", "sched@example.com"}


def _update_payload(**kwargs) -> dict:
    payload = _payload(**kwargs)
    del payload["password"]
    return payload


def _manager(db_session, organization, customer, email: str = "manager@example.com") -> User:
    user = User(
        email=email, first_name="M", last_name="G", role=RoleEnum.MANAGER,
        hashed_password=get_password_hash(PASSWORD), organization_id=organization.id, clients=[customer],
    )
    db_session.add(user)
    db_session.commit()
    return user


def _override_persisted_admin(db_session) -> User:
    """An admin that exists in the DB, for the rules that compare the target with the acting user."""
    admin = User(email="self@example.com", first_name="A", last_name="D", role=RoleEnum.ADMIN, hashed_password="x")
    db_session.add(admin)
    db_session.commit()
    app.dependency_overrides[get_current_admin_user] = lambda: admin
    return admin


def _user_link_counts(db_session, user_id: int) -> Tuple[int, int]:
    counts = []
    for table in (user_clients_association, user_locations_association):
        counts.append(db_session.execute(
            select(func.count()).select_from(table).where(table.c.user_id == user_id)
        ).scalar_one())
    return counts[0], counts[1]


def test_update_replaces_details_and_scope(client, db_session):
    _override_admin()
    first_org, first_client, _ = _hierarchy(db_session, "First")
    second_org, second_client, second_location = _hierarchy(db_session, "Second")
    user = _manager(db_session, first_org, first_client)
    hashed_password = user.hashed_password

    payload = _update_payload(
        email="Renamed@Example.com", role="scheduler", organization_id=second_org.id,
        client_ids=[second_client.id], location_ids=[second_location.id],
    )
    response = client.put(f"/api/users/{user.id}", json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == "renamed@example.com"
    assert body["first_name"] == "New"
    assert body["role"] == "scheduler"
    assert body["organization_id"] == second_org.id
    assert [c["id"] for c in body["clients"]] == [second_client.id]
    assert [l["id"] for l in body["locations"]] == [second_location.id]

    db_session.expire_all()
    assert db_session.get(User, user.id).hashed_password == hashed_password
    assert _user_link_counts(db_session, user.id) == (1, 1)


def test_update_to_admin_clears_scope(client, db_session):
    _override_admin()
    organization, customer, _ = _hierarchy(db_session)
    user = _manager(db_session, organization, customer)

    response = client.put(f"/api/users/{user.id}", json=_update_payload(email=user.email, role="admin"))

    assert response.status_code == 200, response.text
    assert response.json()["organization_id"] is None
    assert _user_link_counts(db_session, user.id) == (0, 0)


def test_update_with_another_users_email_is_refused(client, db_session):
    _override_admin()
    organization, customer, _ = _hierarchy(db_session)
    user = _manager(db_session, organization, customer)
    _manager(db_session, organization, customer, email="taken@example.com")

    response = client.put(f"/api/users/{user.id}", json=_update_payload(
        email="TAKEN@example.com", organization_id=organization.id, client_ids=[customer.id],
    ))

    assert response.status_code == 409
    assert response.json()["code"] == "email_taken"


def test_update_keeping_own_email_is_allowed(client, db_session):
    _override_admin()
    organization, customer, _ = _hierarchy(db_session)
    user = _manager(db_session, organization, customer)

    response = client.put(f"/api/users/{user.id}", json=_update_payload(
        email=user.email, organization_id=organization.id, client_ids=[customer.id],
    ))

    assert response.status_code == 200, response.text


@pytest.mark.parametrize("new_role, expected_bump", [("scheduler", 1), ("manager", 0)])
def test_only_a_role_change_revokes_tokens(client, db_session, new_role, expected_bump):
    _override_admin()
    organization, customer, _ = _hierarchy(db_session)
    user = _manager(db_session, organization, customer)
    version_before = user.token_version

    response = client.put(f"/api/users/{user.id}", json=_update_payload(
        email=user.email, role=new_role, organization_id=organization.id, client_ids=[customer.id],
    ))

    assert response.status_code == 200, response.text
    db_session.expire_all()
    assert db_session.get(User, user.id).token_version == version_before + expected_bump


def test_update_with_client_from_another_organization_is_refused(client, db_session):
    _override_admin()
    organization, customer, _ = _hierarchy(db_session, "First")
    _, other_client, _ = _hierarchy(db_session, "Second")
    user = _manager(db_session, organization, customer)

    response = client.put(f"/api/users/{user.id}", json=_update_payload(
        email=user.email, organization_id=organization.id, client_ids=[other_client.id],
    ))

    assert response.status_code == 400
    assert response.json()["code"] == "user_scope_invalid"


def test_update_with_location_from_another_organization_is_refused(client, db_session):
    _override_admin()
    organization, customer, _ = _hierarchy(db_session, "First")
    _, _, other_location = _hierarchy(db_session, "Second")
    user = _manager(db_session, organization, customer)

    response = client.put(f"/api/users/{user.id}", json=_update_payload(
        email=user.email, organization_id=organization.id, location_ids=[other_location.id],
    ))

    assert response.status_code == 400
    assert response.json()["code"] == "user_scope_invalid"


def test_changing_own_role_is_refused(client, db_session):
    organization, customer, _ = _hierarchy(db_session)
    admin = _override_persisted_admin(db_session)

    response = client.put(f"/api/users/{admin.id}", json=_update_payload(
        email=admin.email, organization_id=organization.id, client_ids=[customer.id],
    ))

    assert response.status_code == 400
    assert response.json()["code"] == "user_self_change_forbidden"


def test_admin_can_edit_own_name(client, db_session):
    admin = _override_persisted_admin(db_session)

    response = client.put(f"/api/users/{admin.id}", json=_update_payload(email=admin.email, role="admin"))

    assert response.status_code == 200, response.text
    assert response.json()["first_name"] == "New"


def test_deleting_self_is_refused(client, db_session):
    admin = _override_persisted_admin(db_session)

    response = client.delete(f"/api/users/{admin.id}")

    assert response.status_code == 400
    assert response.json()["code"] == "user_self_change_forbidden"
    db_session.expire_all()
    assert db_session.get(User, admin.id) is not None


def test_delete_removes_user_and_links_and_keeps_published_week(client, db_session):
    _override_admin()
    organization, customer, location = _hierarchy(db_session)
    user = _manager(db_session, organization, customer)
    user.locations = [location]
    week = ScheduleWeek(
        location_id=location.id, week_start_date=date(2026, 1, 4), is_published=True, published_by_user_id=user.id,
    )
    db_session.add(week)
    db_session.commit()
    user_id = user.id

    response = client.delete(f"/api/users/{user_id}")

    assert response.status_code == 204, response.text
    db_session.expire_all()
    assert db_session.get(User, user_id) is None
    assert _user_link_counts(db_session, user_id) == (0, 0)
    assert db_session.get(ScheduleWeek, week.id).is_published is True
    assert db_session.get(ScheduleWeek, week.id).published_by_user_id is None


def test_delete_of_user_linked_to_employee_is_refused(client, db_session):
    _override_admin()
    organization, customer, location = _hierarchy(db_session)
    employee = Employee(location_id=location.id)
    db_session.add(employee)
    db_session.flush()
    user = _manager(db_session, organization, customer)
    user.employee_id = employee.id
    db_session.commit()

    response = client.delete(f"/api/users/{user.id}")

    assert response.status_code == 409
    assert response.json()["code"] == "user_linked_to_employee"
    db_session.expire_all()
    assert db_session.get(User, user.id) is not None
    assert db_session.get(Employee, employee.id) is not None


def test_employee_login_is_not_editable_here(client, db_session):
    _override_admin()
    _, _, location = _hierarchy(db_session)
    employee = Employee(location_id=location.id)
    db_session.add(employee)
    db_session.flush()
    user = User(
        email="emp@example.com", first_name="E", last_name="M", role=RoleEnum.EMPLOYEE,
        hashed_password="x", employee_id=employee.id,
    )
    db_session.add(user)
    db_session.commit()

    assert client.put(f"/api/users/{user.id}", json=_update_payload(role="admin")).status_code == 404
    assert client.delete(f"/api/users/{user.id}").status_code == 404


def test_missing_user_is_404(client, db_session):
    _override_admin()

    assert client.put("/api/users/999999", json=_update_payload(role="admin")).status_code == 404
    assert client.delete("/api/users/999999").status_code == 404


def test_update_and_delete_require_a_token(client, db_session):
    assert client.put("/api/users/1", json=_update_payload(role="admin")).status_code == 401
    assert client.delete("/api/users/1").status_code == 401


def test_manager_cannot_update_or_delete_users(client, db_session):
    organization, customer, _ = _hierarchy(db_session)
    manager = _manager(db_session, organization, customer)
    target = _manager(db_session, organization, customer, email="target@example.com")
    token = client.post(
        "/api/auth/login", data={"username": manager.email, "password": PASSWORD}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.put(
        f"/api/users/{target.id}", json=_update_payload(role="admin"), headers=headers
    ).status_code == 403
    assert client.delete(f"/api/users/{target.id}", headers=headers).status_code == 403
