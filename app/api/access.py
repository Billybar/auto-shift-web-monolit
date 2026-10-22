from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import models, schemas


def ensure_location_access(
    db: Session, user: models.User, location_id: int, allow_own_employee_location: bool = False
) -> None:
    """
    Raises 404 unless the location exists and is in the user's scope: admins see every location,
    others the locations and clients linked to them, and (with allow_own_employee_location, for
    read-only routes) an employee also sees their own location.
    The same 404 covers "doesn't exist" and "not yours", so the response doesn't reveal which (IDOR).
    """
    not_found = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found or access denied")

    location_row = db.execute(
        select(models.Location.client_id).where(models.Location.id == location_id)
    ).first()
    if location_row is None:
        raise not_found
    loc_client_id = location_row.client_id

    if user.role == schemas.RoleEnum.ADMIN:
        return

    allowed_location_ids = [loc.id for loc in user.locations]
    allowed_client_ids = [client.id for client in user.clients]

    is_own_location = bool(
        allow_own_employee_location
        and user.role == schemas.RoleEnum.EMPLOYEE
        and user.employee_id
        and user.employee
        and user.employee.location_id == location_id
    )

    if not is_own_location and location_id not in allowed_location_ids and loc_client_id not in allowed_client_ids:
        raise not_found
