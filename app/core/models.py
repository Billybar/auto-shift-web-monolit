import enum
from datetime import date
from sqlalchemy import Integer, String, ForeignKey, Boolean, Date, Enum
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import List, Optional
from app.core.database import Base


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
    weights: Mapped[Optional["LocationWeights"]] = relationship("LocationWeights", back_populates="location", uselist=False)


# ==========================================
#       Level 4: Operational Data (Shifts, Employees)
# ==========================================


class ShiftDefinition(Base):
    """
    Defines the generic 'type' of a shift (e.g., 'Morning', 'Evening').
    This acts as the parent template for the shift.
    """
    __tablename__ = "shift_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(Integer, ForeignKey("locations.id"))
    shift_name: Mapped[str] = mapped_column(String)  # e.g., "Morning", "Evening"
    # Default staff count (used if no specific daily demand is defined for a certain day)
    default_staff_count: Mapped[int] = mapped_column(Integer, default=2)

    location: Mapped["Location"] = relationship("Location", back_populates="shift_definitions")
    # Relationship to the daily breakdown table
    daily_demands: Mapped[List["ShiftDemand"]] = relationship("ShiftDemand", back_populates="shift_definition")


class ShiftDemand(Base):
    """
    Granular configuration for specific days.
    Allows overriding the default staff count for specific days of the week.
    Example: Friday (5) might need 1 worker, while the rest of the week needs 2.
    """
    __tablename__ = "shift_demands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    shift_definition_id: Mapped[int] = mapped_column(Integer, ForeignKey("shift_definitions.id"))
    day_of_week: Mapped[int] = mapped_column(Integer)  # 0=Sunday, 6=Saturday
    staff_needed: Mapped[int] = mapped_column(Integer)

    shift_definition: Mapped["ShiftDefinition"] = relationship("ShiftDefinition", back_populates="daily_demands")


class LocationWeights(Base):
    """Optimization weights specific to this location."""
    __tablename__ = "location_weights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(Integer, ForeignKey("locations.id"), unique=True)

    # Optimization Penalties
    target_shifts: Mapped[int] = mapped_column(Integer, default=40)
    rest_gap: Mapped[int] = mapped_column(Integer, default=40)
    max_nights: Mapped[int] = mapped_column(Integer, default=5)
    max_mornings: Mapped[int] = mapped_column(Integer, default=6)
    max_evenings: Mapped[int] = mapped_column(Integer, default=2)
    min_nights: Mapped[int] = mapped_column(Integer, default=5)
    min_mornings: Mapped[int] = mapped_column(Integer, default=4)
    min_evenings: Mapped[int] = mapped_column(Integer, default=2)
    consecutive_nights: Mapped[int] = mapped_column(Integer, default=100)

    location: Mapped["Location"] = relationship("Location", back_populates="weights")


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(Integer, ForeignKey("locations.id"))
    name: Mapped[str] = mapped_column(String, index=True)
    color: Mapped[str] = mapped_column(String, default="FFFFFF")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # History State
    history_streak: Mapped[int] = mapped_column(Integer, default=0)
    worked_last_fri_night: Mapped[bool] = mapped_column(Boolean, default=False)
    worked_last_sat_noon: Mapped[bool] = mapped_column(Boolean, default=False)
    worked_last_sat_night: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    location: Mapped["Location"] = relationship("Location", back_populates="employees")
    settings: Mapped[Optional["EmployeeSettings"]] = relationship("EmployeeSettings", back_populates="employee",
                                                                  uselist=False)
    constraints: Mapped[List["WeeklyConstraint"]] = relationship("WeeklyConstraint", back_populates="employee")
    assignments: Mapped[List["Assignment"]] = relationship("Assignment", back_populates="employee")


class EmployeeSettings(Base):
    """Personal preferences for specific employee."""
    __tablename__ = "employee_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), unique=True)

    # Limits
    min_shifts_per_week: Mapped[int] = mapped_column(Integer, default=0)
    max_shifts_per_week: Mapped[int] = mapped_column(Integer, default=6)

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

class ConstraintType:
    CANNOT_WORK = "cannot_work"
    MUST_WORK = "must_work"
    PREFER_NOT = "prefer_not"
    PREFER_TO = "prefer_to"


class WeeklyConstraint(Base):
    __tablename__ = "weekly_constraints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    shift_id: Mapped[int] = mapped_column(ForeignKey("shift_definitions.id"))
    date: Mapped[date] = mapped_column(Date, index=True)
    constraint_type: Mapped[str] = mapped_column(String)

    employee: Mapped["Employee"] = relationship("Employee", back_populates="constraints")


class Assignment(Base):
    """The final schedule result."""
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    shift_id: Mapped[int] = mapped_column(ForeignKey("shift_definitions.id"))
    date: Mapped[date] = mapped_column(Date, index=True)

    location: Mapped["Location"] = relationship("Location", back_populates="assignments")
    employee: Mapped["Employee"] = relationship("Employee", back_populates="assignments")
    shift_def: Mapped["ShiftDefinition"] = relationship("ShiftDefinition")

# Define user roles using an Enum
class RoleEnum(str, enum.Enum):
    ADMIN = "admin"
    EMPLOYEE = "employee"


class User(Base):
    """
    Handles authentication and authorization (Identity).
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)

    # Define the access level
    role: Mapped[RoleEnum] = mapped_column(Enum(RoleEnum), default=RoleEnum.EMPLOYEE)

    # If the user is an employee, link them to their scheduling data.
    employee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("employees.id"), nullable=True)

    # Relationship to fetch the actual employee scheduling data
    employee: Mapped[Optional["Employee"]] = relationship("Employee")