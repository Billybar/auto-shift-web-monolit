from dataclasses import dataclass
from typing import FrozenSet

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, or_, select, true
from sqlalchemy.orm import Session

from app.core import models, schemas


@dataclass(frozen=True)
class AccessScope:
    """
    The data a user may reach: everything for admins; for anyone else, the locations linked to them
    and every location of the clients linked to them.
    Filter queries with it, so "doesn't exist" and "not yours" look the same to the caller (IDOR).
    """
    is_admin: bool
    location_ids: FrozenSet[int]
    client_ids: FrozenSet[int]

    @classmethod
    def of(cls, user: models.User, include_own_location: bool = False) -> "AccessScope":
        """
        The scope of `user`. include_own_location (read-only routes): an employee also reaches the
        location they work in, even when it isn't linked to their user.
        """
        if user.role == schemas.RoleEnum.ADMIN:
            return cls(is_admin=True, location_ids=frozenset(), client_ids=frozenset())

        location_ids = {location.id for location in user.locations}
        if include_own_location and user.role == schemas.RoleEnum.EMPLOYEE and user.employee_id and user.employee:
            location_ids.add(user.employee.location_id)
        return cls(
            is_admin=False,
            location_ids=frozenset(location_ids),
            client_ids=frozenset(client.id for client in user.clients),
        )

    def location_filter(self, location_id_column) -> ColumnElement[bool]:
        """SQL condition "this location id is in scope", for any column that holds a location id."""
        if self.is_admin:
            return true()
        return or_(
            location_id_column.in_(sorted(self.location_ids)),
            location_id_column.in_(
                select(models.Location.id).where(models.Location.client_id.in_(sorted(self.client_ids)))
            ),
        )

    def client_filter(self) -> ColumnElement[bool]:
        """SQL condition on Client rows: linked to the user, or the client of a location in scope."""
        if self.is_admin:
            return true()
        return or_(
            models.Client.id.in_(sorted(self.client_ids)),
            models.Client.id.in_(
                select(models.Location.client_id).where(models.Location.id.in_(sorted(self.location_ids)))
            ),
        )

    def covers(self, location) -> bool:
        """Whether an already-loaded location (anything with .id and .client_id) is in scope."""
        return self.is_admin or location.id in self.location_ids or location.client_id in self.client_ids


def ensure_location_access(
    db: Session, user: models.User, location_id: int, allow_own_employee_location: bool = False
) -> None:
    """
    Raises 404 unless the location exists and is in the user's scope (see AccessScope);
    allow_own_employee_location is for read-only routes.
    The same 404 covers "doesn't exist" and "not yours", so the response doesn't reveal which (IDOR).
    """
    location = db.execute(
        select(models.Location.id, models.Location.client_id).where(models.Location.id == location_id)
    ).first()
    scope = AccessScope.of(user, include_own_location=allow_own_employee_location)
    if location is None or not scope.covers(location):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found or access denied")
