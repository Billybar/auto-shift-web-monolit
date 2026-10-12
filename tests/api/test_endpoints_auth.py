# tests/api/test_endpoints_auth.py
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import get_current_scheduler_user
from app.core.enums import RoleEnum
from app.core.models import User, Organization, Client, Location
from app.core.security import get_password_hash
from app.services import auth_service
from main import app


def _create_user(db_session, email: str = "john@example.com", password: str = "secret123") -> User:
    user = User(
        email=email,
        first_name="John",
        last_name="Doe",
        hashed_password=get_password_hash(password),
        role=RoleEnum.EMPLOYEE,
    )
    db_session.add(user)
    db_session.commit()
    return user


def test_login_is_case_insensitive(client, db_session):
    """
    Login must find the user regardless of the casing or surrounding whitespace of the typed email.
    """
    _create_user(db_session)

    response = client.post(
        "/api/auth/login",
        data={"username": "  John@Example.COM ", "password": "secret123"},
    )

    assert response.status_code == 200
    assert "access_token" in response.json()


def test_forgot_password_is_case_insensitive(client, db_session, monkeypatch):
    """
    A mixed-case email in the forgot-password request must still match the stored user.
    """
    sent_to = []
    monkeypatch.setattr(auth_service, "send_password_reset_email", lambda email, otp: sent_to.append(email))
    user = _create_user(db_session)

    response = client.post("/api/auth/forgot-password", json={"email": "JOHN@example.com"})

    assert response.status_code == 200
    db_session.refresh(user)
    assert user.reset_otp is not None
    assert sent_to == ["john@example.com"]


def test_create_employee_lowercases_email_and_rejects_case_duplicates(client, db_session):
    """
    Employee creation stores the email lowercase, and a second email differing only by case is a duplicate.
    """
    app.dependency_overrides[get_current_scheduler_user] = lambda: User(
        id=999, email="admin@example.com", role=RoleEnum.ADMIN
    )

    org = Organization(name="Auth Org")
    db_session.add(org)
    db_session.flush()
    client_db = Client(name="Auth Client", organization_id=org.id)
    db_session.add(client_db)
    db_session.flush()
    location = Location(name="Auth Loc", client_id=client_db.id)
    db_session.add(location)
    db_session.commit()

    payload = {
        "location_id": location.id,
        "first_name": "John",
        "last_name": "Doe",
        "email": "John@Example.com",
        "password": "secret123",
    }
    first = client.post("/api/employees/", json=payload)
    second = client.post("/api/employees/", json={**payload, "email": "JOHN@example.com"})

    app.dependency_overrides.pop(get_current_scheduler_user, None)

    assert first.status_code == 201
    assert first.json()["user"]["email"] == "john@example.com"
    stored = db_session.execute(select(User.email)).scalars().all()
    assert stored == ["john@example.com"]

    assert second.status_code == 400
    assert second.json()["detail"] == "Email already registered"


def test_db_rejects_mixed_case_email(db_session):
    """
    The ck_users_email_lowercase constraint blocks writes that bypass the schemas.
    """
    with pytest.raises(IntegrityError):
        _create_user(db_session, email="Mixed@Example.com")
    db_session.rollback()
