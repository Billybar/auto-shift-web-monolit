import enum
from datetime import date, datetime
from sqlalchemy import Integer, String, ForeignKey, Boolean, Date, Enum, Table, Column, DateTime, UniqueConstraint, Text, CheckConstraint, Index, text
from sqlalchemy.sql import func # for server_default timestamp
from sqlalchemy.orm import relationship, Mapped, mapped_column

from typing import List, Optional

from app.core import shift_timing
from app.core.constants import DEFAULT_LOCATION_WEIGHTS, DEFAULT_POSITION_COLOR
from app.core.database import Base
from app.core.enums import ConstraintType, RoleEnum, ShiftCategory


# ==========================================
#       Level 1: The Service Provider
# ==========================================
class Organization(Base):
    """
    The top level entity. Example: 'Team3'.
    """
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True)  # e.g., "Team3"

    # Relationship to Clients
    clients: Mapped[List["Client"]] = relationship("Client", back_populates="organization")


# ==========================================
#       Level 2: The Client
# ==========================================
class Client(Base):
    """
    The customer company. Example: 'SolarEdge', 'Microsoft'.
    """
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, index=True)  # e.g., "SolarEdge"
    organization_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id"))

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="clients")
    locations: Mapped[List["Location"]] = relationship("Location", back_populates="client")


# ==========================================
#       Level 3: The Specific Location (Operational Unit)
# ==========================================
class Location(Base):
    """
    The physical site where shifts happen. Example: 'SolarEdge - Gate 1'.
    This replaces the old 'Workplace' model.
    """
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, index=True)  # e.g., "Location 1"
    client_id: Mapped[int] = mapped_column(Integer, ForeignKey("clients.id"))

    # Configuration Constants (NUM_DAYS, NUM_SHIFTS)
    cycle_length: Mapped[int] = mapped_column(Integer, default=7)  # e.g., 7 days
    shifts_per_day: Mapped[int] = mapped_column(Integer, default=3)  # e.g., 3 shifts (Morning, Eve, Night)

    # Relationships
    client: Mapped["Client"] = relationship("Client", back_populates="locations")

    # Operational Children
    employees: Mapped[List["Employee"]] = relationship("Employee", back_populates="location")
    shift_definitions: Mapped[List["ShiftDefinition"]] = relationship("ShiftDefinition", back_populates="location")
    assignments: Mapped[List["Assignment"]] = relationship("Assignment", back_populates="location")
    # Roles (תפקידים) defined for this site; the DB cascades their links and demand rows
    positions: Mapped[List["Position"]] = relationship(
        "Position", order_by="(Position.sort_order, Position.id)", cascade="all, delete-orphan", passive_deletes=True
    )
    # Weights are owned by the location: deleting the location deletes its weights row
    weights: Mapped[Optional["LocationWeights"]] = relationship(
        "LocationWeights", back_populates="location", uselist=False, cascade="all, delete-orphan"
    )


# ==========================================
#       Level 4: Operational Data (Shifts, Employees)
# ==========================================

class Position(Base):
    """
    A role an employee fills in a shift (e.g. shift supervisor, guard), defined per location.
    Called "Position" in code because "role" already means the login permission (User.role).
    Archived roles (is_active=False) keep their history but are ignored by demand and the solver.
    """
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("locations.id", ondelete="CASCADE", name="fk_positions_location_id"), index=True
    )
    name: Mapped[str] = mapped_column(String(40))
    # Hex without '#', like Employee.color
    color: Mapped[str] = mapped_column(String(6), default=DEFAULT_POSITION_COLOR)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        UniqueConstraint("location_id", "name", name="uix_position_location_name"),
    )


class EmployeePosition(Base):
    """
    The roles an employee can fill. At most one of them is the primary role,
    which auto-assign prefers (see LocationWeights.secondary_position).
    """
    __tablename__ = "employee_positions"

    employee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE", name="fk_employee_positions_employee_id"),
        primary_key=True,
    )
    position_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("positions.id", ondelete="CASCADE", name="fk_employee_positions_position_id"),
        primary_key=True, index=True,
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))

    position: Mapped["Position"] = relationship("Position")

    __table_args__ = (
        # At most one primary role per employee
        Index("uix_employee_primary_position", "employee_id", unique=True, postgresql_where=text("is_primary")),
    )


class ConstraintGroup(Base):
    """
    A row of the constraints board: one or more shifts of a location that employees mark together
    (e.g. two morning shifts with the same hours). WeeklyConstraint rows point at a group; the
    scheduling service expands them to the group's current shifts.
    A group whose shifts were all moved or deleted is kept while constraint rows still point at it.
    """
    __tablename__ = "constraint_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("locations.id", ondelete="CASCADE", name="fk_constraint_groups_location_id"), index=True
    )
    # None: the board shows the names of the group's shifts
    name: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    shifts: Mapped[List["ShiftDefinition"]] = relationship("ShiftDefinition", back_populates="constraint_group")


class ShiftDefinition(Base):
    """
    Defines the generic 'type' of a shift (e.g., 'Morning', 'Evening').
    This acts as the parent template for the shift.
    The engine reads a shift by its hours only, never its name (see app/core/shift_timing.py).
    """
    __tablename__ = "shift_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(Integer, ForeignKey("locations.id"))
    name: Mapped[str] = mapped_column(String)  # e.g., "Morning", "Evening"
    start_time: Mapped[str] = mapped_column(String, default="00:00")  # "HH:MM"
    end_time: Mapped[str] = mapped_column(String, default="00:00")
    # The constraints-board row this shift is marked through (see constraint_group_service.create_group_for)
    constraint_group_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("constraint_groups.id", ondelete="RESTRICT", name="fk_shift_definitions_constraint_group_id"),
        index=True,
    )

    location: Mapped["Location"] = relationship("Location", back_populates="shift_definitions")
    constraint_group: Mapped["ConstraintGroup"] = relationship("ConstraintGroup", back_populates="shifts")
    # Relationship to the weekly template (per day and role)
    daily_demands: Mapped[List["ShiftDemand"]] = relationship(
        "ShiftDemand", back_populates="shift_definition", cascade="all, delete-orphan"
    )
    # Relationship to specific date overrides
    demand_overrides: Mapped[List["ShiftDemandOverride"]] = relationship(
        "ShiftDemandOverride", back_populates="shift_definition", cascade="all, delete-orphan"
    )

    # Read by ShiftDefinitionResponse through from_attributes; None when the hours are invalid
    @property
    def category(self) -> Optional[ShiftCategory]:
        timing = shift_timing.try_timing(self)
        return timing.category if timing else None

class ShiftDemand(Base):
    """
    Weekly template: how many employees a shift needs in a role on a day of the week.
    Example: Friday (5) morning needs 1 supervisor and 2 guards. A missing row means 0.
    """
    __tablename__ = "shift_demands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    shift_definition_id: Mapped[int] = mapped_column(Integer, ForeignKey("shift_definitions.id"))
    day_of_week: Mapped[int] = mapped_column(Integer)  # 0=Sunday, 6=Saturday
    position_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("positions.id", ondelete="CASCADE", name="fk_shift_demands_position_id"), index=True
    )
    required_employees: Mapped[int] = mapped_column(Integer)

    shift_definition: Mapped["ShiftDefinition"] = relationship("ShiftDefinition", back_populates="daily_demands")

    __table_args__ = (
        UniqueConstraint("shift_definition_id", "day_of_week", "position_id", name="uix_shift_demand_day_position"),
    )


class ShiftDemandOverride(Base):
    """
    Overrides the required staff count of one role for a specific date.
    Used when a specific date deviates from the standard weekly template (ShiftDemand).
    """
    __tablename__ = "shift_demand_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    shift_definition_id: Mapped[int] = mapped_column(Integer, ForeignKey("shift_definitions.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    position_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("positions.id", ondelete="CASCADE", name="fk_shift_demand_overrides_position_id"), index=True
    )
    required_employees: Mapped[int] = mapped_column(Integer)

    shift_definition: Mapped["ShiftDefinition"] = relationship("ShiftDefinition", back_populates="demand_overrides")

    __table_args__ = (
        UniqueConstraint("shift_definition_id", "date", "position_id", name="uix_shift_demand_override_date_position"),
    )

class LocationWeights(Base):
    """Optimization weights specific to this location."""
    __tablename__ = "location_weights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(Integer, ForeignKey("locations.id"), unique=True)

    # Optimization Penalties
    target_shifts: Mapped[int] = mapped_column(Integer, default=DEFAULT_LOCATION_WEIGHTS["target_shifts"])
    rest_gap: Mapped[int] = mapped_column(Integer, default=DEFAULT_LOCATION_WEIGHTS["rest_gap"])
    max_nights: Mapped[int] = mapped_column(Integer, default=DEFAULT_LOCATION_WEIGHTS["max_nights"])
    max_mornings: Mapped[int] = mapped_column(Integer, default=DEFAULT_LOCATION_WEIGHTS["max_mornings"])
    max_evenings: Mapped[int] = mapped_column(Integer, default=DEFAULT_LOCATION_WEIGHTS["max_evenings"])
    min_nights: Mapped[int] = mapped_column(Integer, default=DEFAULT_LOCATION_WEIGHTS["min_nights"])
    min_mornings: Mapped[int] = mapped_column(Integer, default=DEFAULT_LOCATION_WEIGHTS["min_mornings"])
    min_evenings: Mapped[int] = mapped_column(Integer, default=DEFAULT_LOCATION_WEIGHTS["min_evenings"])
    consecutive_nights: Mapped[int] = mapped_column(Integer, default=DEFAULT_LOCATION_WEIGHTS["consecutive_nights"])
    secondary_position: Mapped[int] = mapped_column(
        Integer,
        default=DEFAULT_LOCATION_WEIGHTS["secondary_position"],
        server_default=str(DEFAULT_LOCATION_WEIGHTS["secondary_position"]),
    )

    location: Mapped["Location"] = relationship("Location", back_populates="weights")


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(Integer, ForeignKey("locations.id"))
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    color: Mapped[str] = mapped_column(String, default="FFFFFF")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # External Integrations (Nullable, Unique, Indexed for fast lookups)
    yalam_id: Mapped[Optional[str]] = mapped_column(String, unique=True, index=True, nullable=True)
    mishmarot_id: Mapped[Optional[str]] = mapped_column(String, unique=True, index=True, nullable=True)
    shiftorg_id: Mapped[Optional[str]] = mapped_column(String, unique=True, index=True, nullable=True)

    # Relationships
    location: Mapped["Location"] = relationship("Location", back_populates="employees")
    user: Mapped[Optional["User"]] = relationship("User", back_populates="employee")
    settings: Mapped[Optional["EmployeeSettings"]] = relationship(
        "EmployeeSettings", back_populates="employee", uselist=False, cascade="all, delete-orphan"
    )
    constraints: Mapped[List["WeeklyConstraint"]] = relationship(
        "WeeklyConstraint", back_populates="employee", cascade="all, delete-orphan"
    )
    assignments: Mapped[List["Assignment"]] = relationship(
        "Assignment", back_populates="employee", cascade="all, delete-orphan"
    )
    weekly_notes: Mapped[List["WeeklyNote"]] = relationship(
        "WeeklyNote", back_populates="employee", cascade="all, delete-orphan"
    )
    # Roles this employee can fill (see EmployeePosition)
    position_links: Mapped[List["EmployeePosition"]] = relationship(
        "EmployeePosition", cascade="all, delete-orphan", passive_deletes=True
    )

    # Read by EmployeeResponse through from_attributes
    @property
    def position_ids(self) -> List[int]:
        return sorted(link.position_id for link in self.position_links)

    @property
    def primary_position_id(self) -> Optional[int]:
        return next((link.position_id for link in self.position_links if link.is_primary), None)


class EmployeeSettings(Base):
    """Personal preferences for specific employee."""
    __tablename__ = "employee_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), unique=True)

    # Limits
    min_shifts_per_week: Mapped[int] = mapped_column(Integer, default=0)
    max_shifts_per_week: Mapped[int] = mapped_column(Integer, default=6)
    target_shifts: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Specific Preference Limits (Mapped from Config)
    max_nights: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    min_nights: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_mornings: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    min_mornings: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_evenings: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    min_evenings: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    employee: Mapped["Employee"] = relationship("Employee", back_populates="settings")

# ==========================================
#       Constraints & Assignments
# ==========================================

class WeeklyConstraint(Base):
    """
    An employee's availability for one constraints-board row (a ConstraintGroup) on one date.
    It applies to every shift of the group: cannot_work blocks each of them, must_work means one of them.
    """
    __tablename__ = "weekly_constraints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    # RESTRICT: a group with submitted constraints is never deleted, so no history is lost
    group_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("constraint_groups.id", ondelete="RESTRICT", name="fk_weekly_constraints_group_id"),
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    constraint_type: Mapped[ConstraintType] = mapped_column(
        Enum(ConstraintType)
    )

    employee: Mapped["Employee"] = relationship("Employee", back_populates="constraints")

    __table_args__ = (
        UniqueConstraint("employee_id", "group_id", "date", name="uix_weekly_constraint_employee_group_date"),
    )

class WeeklyNote(Base):
    __tablename__ = "weekly_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    employee: Mapped["Employee"] = relationship("Employee", back_populates="weekly_notes")

    __table_args__ = (
        UniqueConstraint('employee_id', 'week_start_date', name='uix_employee_week'),
    )

class ScheduleWeek(Base):
    """Tracks the publish status (draft vs published) of a weekly schedule."""
    __tablename__ = "schedule_weeks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"), index=True)
    week_start_date: Mapped[date] = mapped_column(Date, index=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    published_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    location: Mapped["Location"] = relationship("Location")
    published_by: Mapped[Optional["User"]] = relationship("User")

    __table_args__ = (
        UniqueConstraint("location_id", "week_start_date", name="uix_location_week"),
    )

class Assignment(Base):
    """The final schedule result."""
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    shift_id: Mapped[int] = mapped_column(ForeignKey("shift_definitions.id"))
    date: Mapped[date] = mapped_column(Date, index=True)
    # The role filled in this shift. RESTRICT: a role in use can be archived but not deleted
    position_id: Mapped[int] = mapped_column(
        ForeignKey("positions.id", ondelete="RESTRICT", name="fk_assignments_position_id"), index=True
    )

    start_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    end_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    location: Mapped["Location"] = relationship("Location", back_populates="assignments")
    employee: Mapped["Employee"] = relationship("Employee", back_populates="assignments")
    shift_def: Mapped["ShiftDefinition"] = relationship("ShiftDefinition")
    position: Mapped["Position"] = relationship("Position")

    __table_args__ = (
        # One row per employee per shift and date (the Smart Sync key)
        UniqueConstraint("employee_id", "shift_id", "date", name="uix_assignment_employee_shift_date"),
    )

# ==========================================
#       User M2M Association Tables
# ==========================================
# Association table linking users to multiple clients
user_clients_association = Table(
    "user_clients",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("client_id", Integer, ForeignKey("clients.id"), primary_key=True)
)

# Association table linking users to multiple specific locations
user_locations_association = Table(
    "user_locations",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("location_id", Integer, ForeignKey("locations.id"), primary_key=True)
)

class User(Base):
    """
    Handles authentication and authorization (Identity).
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String, index=True)
    last_name: Mapped[str] = mapped_column(String, index=True)
    hashed_password: Mapped[str] = mapped_column(String)

    # Audit and tracking timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Define the access level
    role: Mapped[RoleEnum] = mapped_column(
        Enum(RoleEnum, values_callable=lambda obj: [e.value for e in obj]),
        default=RoleEnum.EMPLOYEE
    )
    # Organization link - useful for Managers and Schedulers
    organization_id: Mapped[Optional[int]] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    # If the user is an employee, link them to their scheduling data.
    employee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("employees.id"), nullable=True)

    # Password reset fields
    reset_otp = Column(String, nullable=True)
    reset_otp_expires_at = Column(DateTime(timezone=True), nullable=True)

    # Embedded in every JWT as 'ver'; bumping it invalidates all of the user's existing tokens
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Emails are stored lowercase so lookups are case-insensitive (see schemas.normalize_email)
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="ck_users_email_lowercase"),
    )

    # --- Relationships ---
    organization: Mapped[Optional["Organization"]] = relationship("Organization")
    employee: Mapped[Optional["Employee"]] = relationship("Employee", back_populates="user")


    # M2M relationships for specific access control
    clients: Mapped[List["Client"]] = relationship(
        "Client", secondary=user_clients_association
    )
    locations: Mapped[List["Location"]] = relationship(
        "Location", secondary=user_locations_association
    )