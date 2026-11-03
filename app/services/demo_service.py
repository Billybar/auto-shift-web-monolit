# app/services/demo_service.py
"""
Public demo sandboxes (DEMO_MODE only; see docker-compose.demo.yml).

Each visitor gets a private organization with one seeded location: roles, three shifts, a weekly
demand template, employees and two weeks of constraints, plus a manager user to log in as. The
manager works shifts too, so the visitor's own constraints board and shifts have something to show.
Isolation comes from the normal scoping: every sandbox user is linked only to its own client and
location. Sandboxes are throwaway; purge_expired deletes them after DEMO_SANDBOX_TTL_HOURS.
"""
import random
import secrets
from datetime import date, timedelta
from typing import List, Literal, Optional

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.core import config
from app.core.enums import ConstraintType, RoleEnum
from app.core.models import (
    Assignment, Client, ConstraintGroup, Employee, EmployeePosition, EmployeeSettings, Location, LocationWeights,
    Organization, Position, ScheduleWeek, ShiftDefinition, ShiftDemand, ShiftDemandOverride, User, WeeklyConstraint,
    WeeklyNote, user_clients_association, user_locations_association,
)
from app.core.security import get_password_hash
from app.services import position_service, shift_demand_service
from app.services.constraint_group_service import create_group_for

# Every sandbox organization is named "Demo-<token>"; cleanup and switch_role only touch these
DEMO_ORG_PREFIX = "Demo-"
DEMO_EMAIL_DOMAIN = "demo.autoshift.co.il"

# (name, start, end): one shift of each category (see app/core/shift_timing.py)
_SHIFTS = [("בוקר", "07:00", "15:00"), ("ערב", "15:00", "23:00"), ("לילה", "23:00", "07:00")]

# (first name, last name, color, max shifts per week, max nights, shift-supervisor role)
# "primary": supervisor first, general too; "secondary": general first, supervisor too; None: general only
_EMPLOYEES = [
    ("יוסי", "כהן", "60A5FA", 5, None, "primary"),
    ("מיכל", "לוי", "F472B6", 5, None, "primary"),
    ("אבי", "מזרחי", "34D399", 6, None, "primary"),
    ("שירה", "פרץ", "FBBF24", 5, 1, "primary"),
    ("דניאל", "ביטון", "A78BFA", 5, None, "secondary"),
    ("נועה", "אברהם", "F87171", 4, 0, None),
    ("איתי", "פרידמן", "2DD4BF", 6, None, None),
    ("רוני", "שפירא", "FB923C", 5, None, None),
    ("תמר", "גולן", "C084FC", 3, 0, None),
    ("עומר", "חדד", "4ADE80", 5, None, None),
    ("ליאור", "אוחיון", "38BDF8", 6, None, None),
    ("הדר", "שלום", "E879F9", 4, None, None),
]
# The same fields for the manager: a supervisor who works fewer shifts and no nights
_MANAGER = ("רותם", "ברק", "94A3B8", 3, 0, "primary")


def _upcoming_sunday(today: date) -> date:
    """The Sunday the web client opens on: the next one, a full week ahead when today is Sunday."""
    return today + timedelta(days=7 - shift_demand_service.system_day_of_week(today))


def _demand_cells(shift_ids: List[int], general_id: int, supervisor_id: int) -> List[tuple]:
    """
    The weekly template: (shift_id, day_of_week, position_id, required). Every shift needs a
    supervisor; mornings and evenings need two general employees on weekdays and one on the
    weekend (Friday 5, Saturday 6), nights one.
    """
    morning, evening, night = shift_ids
    cells = []
    for day in range(7):
        weekend = day in (5, 6)
        for shift_id in (morning, evening):
            cells.append((shift_id, day, general_id, 1 if weekend else 2))
            cells.append((shift_id, day, supervisor_id, 1))
        cells.append((night, day, general_id, 1))
        cells.append((night, day, supervisor_id, 1))
    return cells


def _constraints_for_week(
    employees: List[Employee], group_ids: List[int], week_start: date, rng: random.Random
) -> List[WeeklyConstraint]:
    """
    A realistic mix per employee: two "cannot work" marks and one "prefer to" mark, plus a
    "must work" for every fourth employee (a morning or evening, so it never clashes with a
    no-nights limit). Cells are distinct per employee (one row per employee, group and date).
    """
    rows = []
    for index, employee in enumerate(employees):
        cells = [(day, shift_idx) for day in range(7) for shift_idx in range(len(group_ids))]
        rng.shuffle(cells)
        marks = [ConstraintType.CANNOT_WORK, ConstraintType.CANNOT_WORK, ConstraintType.PREFER_TO]
        picked = cells[:len(marks)]
        if index % 4 == 0:
            must = next(c for c in cells[len(marks):] if c[1] != 2)
            marks.append(ConstraintType.MUST_WORK)
            picked.append(must)
        for (day, shift_idx), constraint_type in zip(picked, marks):
            rows.append(WeeklyConstraint(
                employee_id=employee.id,
                group_id=group_ids[shift_idx],
                date=week_start + timedelta(days=day),
                constraint_type=constraint_type,
            ))
    return rows


def create_sandbox(db: Session) -> User:
    """
    Creates a private, seeded organization for one demo visitor and returns its manager user.
    Commits once at the end.
    """
    token = secrets.token_hex(4)
    # Nobody knows this password: sandbox users get in only through /api/demo
    hashed_password = get_password_hash(secrets.token_urlsafe(32))

    org = Organization(name=f"{DEMO_ORG_PREFIX}{token}")
    client = Client(name="חברת הדגמה", organization=org)
    general = position_service.new_default_position()
    supervisor = Position(name='אחמ"ש', color="F59E0B", sort_order=1, is_active=True)
    location = Location(
        name="סניף ראשי", client=client, cycle_length=7, shifts_per_day=len(_SHIFTS),
        weights=LocationWeights(), positions=[general, supervisor],
    )
    db.add_all([org, client, location])
    db.flush()

    shifts = []
    for name, start, end in _SHIFTS:
        shift = ShiftDefinition(location_id=location.id, name=name, start_time=start, end_time=end)
        create_group_for(shift)
        db.add(shift)
        shifts.append(shift)
    db.flush()

    shift_demand_service.replace_template(
        db, location.id, _demand_cells([s.id for s in shifts], general.id, supervisor.id)
    )

    # (email name, role, entry); the manager is an employee of the location like everyone else
    people = [(f"e{n}", RoleEnum.EMPLOYEE, entry) for n, entry in enumerate(_EMPLOYEES, start=1)]
    people.append(("manager", RoleEnum.MANAGER, _MANAGER))

    employees = []
    manager = None
    for email_name, role, (first_name, last_name, color, max_shifts, max_nights, supervisor_role) in people:
        employee = Employee(location_id=location.id, color=color, is_active=True)
        db.add(employee)
        db.flush()
        db.add(EmployeeSettings(
            employee_id=employee.id, min_shifts_per_week=0, max_shifts_per_week=max_shifts, max_nights=max_nights,
        ))
        user = User(
            email=f"{email_name}.{token}@{DEMO_EMAIL_DOMAIN}",
            first_name=first_name,
            last_name=last_name,
            hashed_password=hashed_password,
            role=role,
            employee_id=employee.id,
            organization_id=org.id,
            clients=[client],
            locations=[location],
        )
        db.add(user)
        if role == RoleEnum.MANAGER:
            manager = user
        if supervisor_role == "primary":
            position_service.set_employee_positions(db, employee, [supervisor.id, general.id], supervisor.id)
        elif supervisor_role == "secondary":
            position_service.set_employee_positions(db, employee, [general.id, supervisor.id], general.id)
        else:
            position_service.set_employee_positions(db, employee, [general.id], general.id)
        employees.append(employee)

    # The week the web client opens on, and the one after (covers the hours when the server's
    # date is a day behind the visitor's)
    rng = random.Random(2026)
    group_ids = [s.constraint_group_id for s in shifts]
    first_week = _upcoming_sunday(date.today())
    for week_start in (first_week, first_week + timedelta(days=7)):
        db.add_all(_constraints_for_week(employees, group_ids, week_start, rng))

    db.commit()
    return manager


def is_sandbox_user(db: Session, user: User) -> bool:
    """True when the user belongs to a demo sandbox organization."""
    if user.organization_id is None:
        return False
    name = db.execute(select(Organization.name).where(Organization.id == user.organization_id)).scalar_one_or_none()
    return bool(name and name.startswith(DEMO_ORG_PREFIX))


def switch_role(db: Session, current_user: User, role: Literal["manager", "employee"]) -> Optional[User]:
    """
    The user of the visitor's sandbox to view the app as: its manager, or its first active employee.
    None when the current user isn't in a sandbox (or the sandbox has no such user left).
    """
    if not is_sandbox_user(db, current_user):
        return None
    stmt = select(User).where(User.organization_id == current_user.organization_id)
    if role == "manager":
        stmt = stmt.where(User.role == RoleEnum.MANAGER).order_by(User.id)
    else:
        stmt = (
            stmt.join(Employee, Employee.id == User.employee_id)
            .where(User.role == RoleEnum.EMPLOYEE, Employee.is_active.is_(True))
            .order_by(Employee.id)
        )
    return db.execute(stmt.limit(1)).scalar_one_or_none()


def count_active(db: Session) -> int:
    """The number of sandboxes in the DB (expired ones included until the next cleanup)."""
    stmt = select(func.count()).select_from(Organization).where(Organization.name.like(f"{DEMO_ORG_PREFIX}%"))
    return db.execute(stmt).scalar_one()


def delete_sandbox(db: Session, org_id: int) -> None:
    """
    Deletes a sandbox organization and everything under it, including what the visitor added.
    Most foreign keys don't cascade, so children go first. Flushes; the caller commits.
    """
    client_ids = list(db.execute(select(Client.id).where(Client.organization_id == org_id)).scalars())
    location_ids = list(db.execute(select(Location.id).where(Location.client_id.in_(client_ids))).scalars())
    employee_ids = list(db.execute(select(Employee.id).where(Employee.location_id.in_(location_ids))).scalars())
    shift_ids = list(db.execute(
        select(ShiftDefinition.id).where(ShiftDefinition.location_id.in_(location_ids))
    ).scalars())
    user_ids = list(db.execute(
        select(User.id).where(or_(User.organization_id == org_id, User.employee_id.in_(employee_ids)))
    ).scalars())

    db.execute(delete(ScheduleWeek).where(ScheduleWeek.location_id.in_(location_ids)))
    db.execute(delete(Assignment).where(
        or_(Assignment.location_id.in_(location_ids), Assignment.employee_id.in_(employee_ids))
    ))
    for model in (WeeklyConstraint, WeeklyNote, EmployeeSettings, EmployeePosition):
        db.execute(delete(model).where(model.employee_id.in_(employee_ids)))
    db.execute(delete(user_locations_association).where(or_(
        user_locations_association.c.user_id.in_(user_ids),
        user_locations_association.c.location_id.in_(location_ids),
    )))
    db.execute(delete(user_clients_association).where(or_(
        user_clients_association.c.user_id.in_(user_ids),
        user_clients_association.c.client_id.in_(client_ids),
    )))
    db.execute(delete(User).where(User.id.in_(user_ids)))
    db.execute(delete(Employee).where(Employee.id.in_(employee_ids)))
    for model in (ShiftDemandOverride, ShiftDemand):
        db.execute(delete(model).where(model.shift_definition_id.in_(shift_ids)))
    for model in (ShiftDefinition, ConstraintGroup, Position, LocationWeights):
        db.execute(delete(model).where(model.location_id.in_(location_ids)))
    db.execute(delete(Location).where(Location.id.in_(location_ids)))
    db.execute(delete(Client).where(Client.id.in_(client_ids)))
    db.execute(delete(Organization).where(Organization.id == org_id))
    db.flush()


def purge_expired(db: Session) -> int:
    """
    Deletes every sandbox older than DEMO_SANDBOX_TTL_HOURS (by its first user's created_at),
    one transaction per sandbox. Returns how many were deleted.
    """
    cutoff = func.now() - timedelta(hours=config.DEMO_SANDBOX_TTL_HOURS)
    stmt = (
        select(Organization.id)
        .join(User, User.organization_id == Organization.id)
        .where(Organization.name.like(f"{DEMO_ORG_PREFIX}%"))
        .group_by(Organization.id)
        .having(func.min(User.created_at) < cutoff)
    )
    expired_ids = list(db.execute(stmt).scalars())
    for org_id in expired_ids:
        delete_sandbox(db, org_id)
        db.commit()
    return len(expired_ids)
