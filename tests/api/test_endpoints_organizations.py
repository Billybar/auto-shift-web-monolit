from app.api.dependencies import get_current_user
from app.core.models import Organization, User
from main import app
from tests.factories import admin_user, employee_user, login_as, make_employee, make_location, scheduler_user


def test_read_organizations_unauthorized(client):
    """No token, no organizations."""
    response = client.get("/api/organizations/")
    assert response.status_code == 401


def test_create_organization_as_admin(client, db_session):
    """An admin can create an organization."""
    login_as(app, admin_user())

    response = client.post("/api/organizations/", json={"name": "Test Organization"})
    app.dependency_overrides.clear()

    assert response.status_code == 201
    assert response.json()["name"] == "Test Organization"
    assert "id" in response.json()


def test_create_duplicate_organization(client, db_session):
    """A second organization with the same name is a 400 (the web hierarchy screen relies on this message)."""
    db_session.add(Organization(name="Unique Org"))
    db_session.commit()
    login_as(app, admin_user())

    response = client.post("/api/organizations/", json={"name": "Unique Org"})
    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


def test_create_organization_forbidden_for_employee(client, db_session):
    """Only admins create organizations."""
    app.dependency_overrides[get_current_user] = lambda: User(id=902, email="employee@test.com", role="employee")

    response = client.post("/api/organizations/", json={"name": "Nope"})
    app.dependency_overrides.clear()

    assert response.status_code == 403


def test_admin_lists_every_organization(client, db_session):
    """Admins see all organizations."""
    make_location(db_session, "A")
    make_location(db_session, "B")
    db_session.commit()
    login_as(app, admin_user())

    response = client.get("/api/organizations/")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert {o["name"] for o in response.json()} == {"A Org", "B Org"}


def test_scheduler_lists_only_organizations_in_scope(client, db_session):
    """A scheduler linked to a location sees that location's organization and no other."""
    mine = make_location(db_session, "Mine")
    make_location(db_session, "Other")
    db_session.commit()
    login_as(app, scheduler_user(locations=[mine]))

    response = client.get("/api/organizations/")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert [o["name"] for o in response.json()] == ["Mine Org"]


def test_scheduler_scoped_by_client_sees_its_organization(client, db_session):
    """A client link reaches the client's organization."""
    mine = make_location(db_session, "Mine")
    make_location(db_session, "Other")
    db_session.commit()
    login_as(app, scheduler_user(clients=[mine.client]))

    response = client.get("/api/organizations/")
    app.dependency_overrides.clear()

    assert [o["name"] for o in response.json()] == ["Mine Org"]


def test_employee_lists_only_own_organization(client, db_session):
    """An employee login sees the organization of the location they work in."""
    mine = make_location(db_session, "Mine")
    make_location(db_session, "Other")
    user = employee_user(db_session, make_employee(db_session, mine))
    db_session.commit()
    login_as(app, user)

    response = client.get("/api/organizations/")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert [o["name"] for o in response.json()] == ["Mine Org"]


def test_user_without_links_lists_no_organizations(client, db_session):
    """No locations, no clients, no employee: nothing to see."""
    db_session.add(Organization(name="Hidden Org"))
    db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: User(id=902, email="employee@test.com", role="employee")

    response = client.get("/api/organizations/")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == []


def test_read_organization_in_scope(client, db_session):
    """A scheduler can open their own organization."""
    mine = make_location(db_session, "Mine")
    org_id = mine.client.organization_id
    db_session.commit()
    login_as(app, scheduler_user(locations=[mine]))

    response = client.get(f"/api/organizations/{org_id}")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["name"] == "Mine Org"


def test_read_organization_out_of_scope_is_404(client, db_session):
    """Another organization answers 404, like one that doesn't exist (IDOR)."""
    mine = make_location(db_session, "Mine")
    other = make_location(db_session, "Other")
    other_org_id = other.client.organization_id
    db_session.commit()
    login_as(app, scheduler_user(locations=[mine]))

    response = client.get(f"/api/organizations/{other_org_id}")
    app.dependency_overrides.clear()

    assert response.status_code == 404
