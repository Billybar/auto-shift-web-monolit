from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.database import get_db
from app.core import config, models, schemas

# Where the client gets a token; must match the login route in endpoints_auth.py
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Roles each guard allows: a higher role passes every guard below it.
# Tuples, not sets: membership compares the DB string with the enum by equality.
_ADMIN_ROLES = (schemas.RoleEnum.ADMIN,)
_MANAGER_ROLES = (*_ADMIN_ROLES, schemas.RoleEnum.MANAGER)
_SCHEDULER_ROLES = (*_MANAGER_ROLES, schemas.RoleEnum.SCHEDULER)


def get_current_user(
        token: str = Depends(oauth2_scheme),
        db: Session = Depends(get_db)
) -> models.User:
    """
    Decode the JWT, then load its user (by email) from the database.
    Injected into every protected route, directly or through a role guard.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
    except jwt.PyJWTError:
        # Expired token, invalid signature, etc.
        raise credentials_exception

    email = payload.get("sub")
    # Tokens issued before versioning carry no 'ver' and are rejected (users log in once more)
    token_version = payload.get("ver")
    if not isinstance(email, str):
        raise credentials_exception

    # The user must still exist. Normalize so tokens issued before emails were lowercased still resolve.
    stmt = select(models.User).where(models.User.email == schemas.normalize_email(email))
    user = db.execute(stmt).scalar_one_or_none()

    if user is None:
        raise credentials_exception

    # A password reset bumps the version, revoking every older token
    if token_version != (user.token_version or 0):
        raise credentials_exception

    return user


def _require_role(user: models.User, allowed: tuple, level: str) -> models.User:
    """Return the user when their role is in `allowed`; otherwise refuse with 403."""
    if user.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Operation forbidden: {level} privileges required."
        )
    return user


def get_current_admin_user(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Guard for Admin-only routes."""
    return _require_role(current_user, _ADMIN_ROLES, "Admin")


def get_current_manager_user(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Guard for Manager-level routes. Allows ADMIN and MANAGER."""
    return _require_role(current_user, _MANAGER_ROLES, "Manager")


def get_current_scheduler_user(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Guard for Scheduler-level routes. Allows ADMIN, MANAGER and SCHEDULER."""
    return _require_role(current_user, _SCHEDULER_ROLES, "Scheduler")
