# tests/api/test_endpoints_auth.py
from datetime import datetime, timedelta

import jwt
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.dependencies import get_current_scheduler_user
from app.core.enums import RoleEnum
from app.core.models import User, Organization, Client, Location
from app.core.security import (
    ACCESS_TOKEN_EXPIRE_DAYS, ALGORITHM, SECRET_KEY, create_access_token, get_password_hash,
)
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

    assert second.status_code == 409
    assert second.json()["detail"] == "Email already registered"


def test_update_employee_rejects_email_of_another_user(client, db_session):
    """
    Changing an employee's email to one owned by another user (in any casing) is rejected with 409.
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
        "email": "john@example.com",
        "password": "secret123",
    }
    first = client.post("/api/employees/", json=payload)
    second = client.post("/api/employees/", json={**payload, "email": "jane@example.com"})
    response = client.put(
        f"/api/employees/{second.json()['id']}",
        json={"location_id": location.id, "email": "JOHN@example.com"},
    )

    app.dependency_overrides.pop(get_current_scheduler_user, None)

    assert first.status_code == 201
    assert second.status_code == 201
    assert response.status_code == 409
    assert response.json()["detail"] == "Email already in use by another user"


def test_db_rejects_mixed_case_email(db_session):
    """
    The ck_users_email_lowercase constraint blocks writes that bypass the schemas.
    """
    with pytest.raises(IntegrityError):
        _create_user(db_session, email="Mixed@Example.com")
    db_session.rollback()


def _login(client, email: str = "john@example.com", password: str = "secret123") -> str:
    response = client.post("/api/auth/login", data={"username": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def _refresh(client, token: str):
    return client.post("/api/auth/refresh", headers={"Authorization": f"Bearer {token}"})


def test_refresh_returns_new_token_with_fresh_claims(client, db_session):
    """
    Refresh issues a full-length token whose claims are rebuilt from the current DB state.
    """
    user = _create_user(db_session)
    token = _login(client)

    user.first_name = "Johnny"
    db_session.commit()

    response = _refresh(client, token)

    assert response.status_code == 200
    claims = jwt.decode(response.json()["access_token"], SECRET_KEY, algorithms=[ALGORITHM])
    assert claims["first_name"] == "Johnny"
    assert claims["ver"] == 0
    assert "iat" in claims
    expected_exp = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    assert abs(claims["exp"] - (expected_exp - datetime(1970, 1, 1)).total_seconds()) < 60


def test_refresh_rejects_expired_token(client, db_session):
    """
    An expired token cannot be exchanged for a new one.
    """
    _create_user(db_session)
    token = create_access_token({"sub": "john@example.com", "ver": 0}, expires_delta=timedelta(seconds=-1))

    assert _refresh(client, token).status_code == 401


def test_token_without_ver_is_rejected(client, db_session):
    """
    Tokens issued before versioning (no 'ver' claim) are rejected, so those users log in once more.
    """
    _create_user(db_session)
    token = create_access_token({"sub": "john@example.com"})

    assert _refresh(client, token).status_code == 401


def test_password_reset_revokes_existing_tokens(client, db_session, monkeypatch):
    """
    Resetting the password bumps token_version, so tokens issued before the reset are rejected.
    """
    monkeypatch.setattr(auth_service, "send_password_reset_email", lambda email, otp: None)
    user = _create_user(db_session)
    old_token = _login(client)

    otp = auth_service.create_password_reset_otp(db_session, user)
    response = client.post(
        "/api/auth/reset-password",
        json={"email": "john@example.com", "otp": otp, "new_password": "newsecret456"},
    )
    assert response.status_code == 200

    assert _refresh(client, old_token).status_code == 401
    new_token = _login(client, password="newsecret456")
    assert _refresh(client, new_token).status_code == 200
