"""Small builders for API and service tests (rows are flushed, not committed)."""
from typing import Optional, Sequence

from app.api.dependencies import get_current_scheduler_user, get_current_user
from app.core.models import (
    Client, Employee, EmployeePosition, EmployeeSettings, Location, LocationWeights, Organization, Position,
    ShiftDefinition, User,
)
from app.services.constraint_group_service import create_group_for
from app.services.position_service import new_default_position


def admin_user() -> User:
    return User(id=900, email="admin@test.com", role="admin")


def scheduler_user(locations: Sequence[Location] = ()) -> User:
    """A scheduler scoped to `locations` only."""
    user = User(id=901, email="scheduler@test.com", role="scheduler")
    user.locations = list(locations)
    return user


def login_as(app, user: User) -> None:
    """Every guard returns `user`; clear app.dependency_overrides after the test."""
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_current_scheduler_user] = lambda: user


def make_location(db, name: str = "Loc") -> Location:
    """A location with its default role ('כללי') and default weights, like POST /api/locations."""
    org = Organization(name=f"{name} Org")
    db.add(org)
    db.flush()
    client = Client(name=f"{name} Client", organization_id=org.id)
    db.add(client)
    db.flush()
    location = Location(name=name, client_id=client.id, weights=LocationWeights(), positions=[new_default_position()])
    db.add(location)
    db.flush()
    return location


def default_position(location: Location) -> Position:
    return location.positions[0]


def make_position(db, location: Location, name: str, sort_order: int = 1, is_active: bool = True) -> Position:
    position = Position(location_id=location.id, name=name, sort_order=sort_order, is_active=is_active)
    db.add(position)
    db.flush()
    return position


def make_shift(db, location: Location, name: str = "בוקר", start: str = "07:00", end: str = "15:00") -> ShiftDefinition:
    """A shift with its own constraints-board row (group), like POST /api/shift-definitions."""
    shift = ShiftDefinition(location_id=location.id, name=name, start_time=start, end_time=end)
    create_group_for(shift)
    db.add(shift)
    db.flush()
    return shift


def make_employee(
    db,
    location: Location,
    positions: Sequence[Position] = (),
    primary: Optional[Position] = None,
    min_shifts: int = 0,
    max_shifts: int = 6,
    target_shifts: Optional[int] = None,
) -> Employee:
    employee = Employee(location_id=location.id, is_active=True)
    db.add(employee)
    db.flush()
    db.add(EmployeeSettings(
        employee_id=employee.id, min_shifts_per_week=min_shifts, max_shifts_per_week=max_shifts,
        target_shifts=target_shifts,
    ))
    for position in positions:
        db.add(EmployeePosition(employee_id=employee.id, position_id=position.id, is_primary=(position is primary)))
    db.flush()
    db.expire(employee, ["position_links"])
    return employee
