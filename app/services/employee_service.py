# app/services/employee_service.py
"""
Writes of an employee together with their login user. Every function flushes only; the caller
checks access and the email, and commits once. Invalid roles raise AppError from position_service.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import models, schemas
from app.core.enums import RoleEnum
from app.core.security import get_password_hash
from app.services import position_service

# EmployeeUpdate fields stored on the login user; the role fields are applied separately
_USER_FIELDS = {"first_name", "last_name", "email"}
_ROLE_FIELDS = {"position_ids", "primary_position_id"}


def create_employee(db: Session, employee_in: schemas.EmployeeCreate, location: models.Location) -> models.Employee:
    """
    Add an employee in `location` with an employee-role login linked to the location, its client
    and organization, default settings, and roles: those sent, or the location's only role.
    """
    employee = models.Employee(
        notes=employee_in.notes,
        location_id=location.id,
        color=employee_in.color,
        is_active=employee_in.is_active,
        yalam_id=employee_in.yalam_id,
        mishmarot_id=employee_in.mishmarot_id,
        shiftorg_id=employee_in.shiftorg_id,
    )
    db.add(employee)
    db.flush()  # the user and the settings need employee.id

    user = models.User(
        email=employee_in.email,
        first_name=employee_in.first_name,
        last_name=employee_in.last_name,
        hashed_password=get_password_hash(employee_in.password),
        role=RoleEnum.EMPLOYEE,
        employee_id=employee.id,
        organization_id=location.client.organization_id if location.client else None,
    )
    if location.client:
        user.clients.append(location.client)
    user.locations.append(location)
    db.add(user)

    db.add(models.EmployeeSettings(employee_id=employee.id, min_shifts_per_week=0, max_shifts_per_week=6))

    if employee_in.position_ids:
        position_service.set_employee_positions(db, employee, employee_in.position_ids, employee_in.primary_position_id)
    else:
        position_service.assign_single_position_if_unambiguous(db, employee)

    db.flush()
    return employee


def update_employee(db: Session, employee: models.Employee, changes: schemas.EmployeeUpdate) -> models.Employee:
    """
    Apply a partial update; omitted and null fields are left as they are. Roles belong to a
    location, so a move drops them, then the location's only role is given unless roles were sent.
    """
    data = changes.model_dump(exclude_unset=True, exclude_none=True)
    location_changed = "location_id" in data and data["location_id"] != employee.location_id

    for field, value in data.items():
        if field in _ROLE_FIELDS:
            continue
        if field in _USER_FIELDS:
            if employee.user:
                setattr(employee.user, field, value)
        else:
            setattr(employee, field, value)

    if location_changed:
        db.flush()
        position_service.clear_employee_positions(db, employee)

    # A role field sent as null still counts: a null primary means "pick it again"
    if changes.model_fields_set & _ROLE_FIELDS:
        if changes.position_ids is not None:
            position_ids = changes.position_ids
        else:
            active_ids = {p.id for p in position_service.get_active_positions(db, employee.location_id)}
            position_ids = [pid for pid in employee.position_ids if pid in active_ids]
        primary_id = position_service.resolve_primary(
            employee.primary_position_id, position_ids, changes.primary_position_id
        )
        position_service.set_employee_positions(db, employee, position_ids, primary_id)
    elif location_changed:
        position_service.assign_single_position_if_unambiguous(db, employee)

    db.flush()
    return employee


def delete_employee(db: Session, employee: models.Employee) -> None:
    """Delete the employee and their login, so no login is left without an employee."""
    user = db.execute(select(models.User).where(models.User.employee_id == employee.id)).scalar_one_or_none()
    db.delete(employee)
    if user:
        db.delete(user)
    db.flush()
