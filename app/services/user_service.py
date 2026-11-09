from typing import List, Optional, Tuple

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core import models, schemas
from app.core.enums import ErrorCode, RoleEnum
from app.core.errors import AppError
from app.core.security import get_password_hash


def email_taken(db: Session, email: str, exclude_user_id: Optional[int] = None) -> bool:
    """
    Return True if a User other than `exclude_user_id` already owns `email`.
    Emails are normalized (lowercase) by the schemas, so a plain equality check is case-insensitive.
    """
    stmt = select(models.User.id).where(models.User.email == email)
    if exclude_user_id is not None:
        stmt = stmt.where(models.User.id != exclude_user_id)
    return db.execute(stmt).first() is not None


def _scope_error(message: str) -> AppError:
    return AppError(ErrorCode.USER_SCOPE_INVALID, message, status_code=400)


def _load_clients(db: Session, organization_id: int, client_ids: List[int]) -> List[models.Client]:
    """Load the requested clients, refusing any that are missing or belong to another organization."""
    if not client_ids:
        return []
    clients = list(db.execute(
        select(models.Client).where(
            models.Client.id.in_(client_ids),
            models.Client.organization_id == organization_id,
        )
    ).scalars().all())
    if len(clients) != len(set(client_ids)):
        raise _scope_error("Every client must exist and belong to the user's organization")
    return clients


def _load_locations(db: Session, organization_id: int, location_ids: List[int]) -> List[models.Location]:
    """Load the requested locations, refusing any that are missing or belong to another organization."""
    if not location_ids:
        return []
    locations = list(db.execute(
        select(models.Location)
        .join(models.Client, models.Location.client_id == models.Client.id)
        .where(
            models.Location.id.in_(location_ids),
            models.Client.organization_id == organization_id,
        )
    ).scalars().all())
    if len(locations) != len(set(location_ids)):
        raise _scope_error("Every location must exist and belong to the user's organization")
    return locations


def _resolve_scope(
    db: Session, fields: schemas.StaffUserFields
) -> Tuple[List[models.Client], List[models.Location]]:
    """Check the requested role and scope fit together, and load the clients and locations they name."""
    if fields.role == RoleEnum.ADMIN:
        if fields.organization_id is not None or fields.client_ids or fields.location_ids:
            raise _scope_error("An admin has global access and takes no organization, clients or locations")
        return [], []

    if fields.organization_id is None:
        raise _scope_error("Managers and schedulers need an organization")
    if not fields.client_ids and not fields.location_ids:
        raise _scope_error("Managers and schedulers need at least one client or location")
    if db.get(models.Organization, fields.organization_id) is None:
        raise _scope_error("Organization does not exist")
    return (
        _load_clients(db, fields.organization_id, fields.client_ids),
        _load_locations(db, fields.organization_id, fields.location_ids),
    )


def create_staff_user(db: Session, user_in: schemas.UserCreate) -> models.User:
    """
    Add an admin, manager or scheduler login. Flushes only; the caller commits.
    Raises AppError when the email is already used or the requested access scope is invalid.
    """
    if email_taken(db, user_in.email):
        raise AppError(ErrorCode.EMAIL_TAKEN, "Email already registered", status_code=409)

    clients, locations = _resolve_scope(db, user_in)

    new_user = models.User(
        email=user_in.email,
        first_name=user_in.first_name,
        last_name=user_in.last_name,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        organization_id=user_in.organization_id,
        clients=clients,
        locations=locations,
    )
    db.add(new_user)
    db.flush()
    return new_user


def update_staff_user(
    db: Session, user: models.User, user_in: schemas.UserUpdate, acting_user: models.User
) -> models.User:
    """
    Replace a staff login's details and access scope. Flushes only; the caller commits.
    Raises AppError on a taken email, an invalid scope, or an admin changing their own role.
    """
    role_changed = user_in.role != user.role
    if role_changed and user.id == acting_user.id:
        raise AppError(ErrorCode.USER_SELF_CHANGE_FORBIDDEN, "You cannot change your own role", status_code=400)

    if email_taken(db, user_in.email, exclude_user_id=user.id):
        raise AppError(ErrorCode.EMAIL_TAKEN, "Email already registered", status_code=409)

    clients, locations = _resolve_scope(db, user_in)

    # The role is stored in the JWT, so older tokens would keep the previous one
    if role_changed:
        user.token_version = (user.token_version or 0) + 1

    user.email = user_in.email
    user.first_name = user_in.first_name
    user.last_name = user_in.last_name
    user.role = user_in.role
    user.organization_id = user_in.organization_id
    user.clients = clients
    user.locations = locations
    db.flush()
    return user


def delete_staff_user(db: Session, user: models.User, acting_user: models.User) -> None:
    """
    Remove a staff login and its access links. Flushes only; the caller commits.
    Weeks the user published stay published, with no publisher recorded.
    Raises AppError for an admin's own account, and for a login linked to an employee.
    """
    if user.id == acting_user.id:
        raise AppError(ErrorCode.USER_SELF_CHANGE_FORBIDDEN, "You cannot delete your own account", status_code=400)

    # Deleting only the login would leave an employee nobody can sign in as
    if user.employee_id is not None:
        raise AppError(
            ErrorCode.USER_LINKED_TO_EMPLOYEE,
            "This user is linked to an employee; delete the employee instead",
            status_code=409,
        )

    db.execute(
        update(models.ScheduleWeek)
        .where(models.ScheduleWeek.published_by_user_id == user.id)
        .values(published_by_user_id=None)
    )
    db.delete(user)
    db.flush()
