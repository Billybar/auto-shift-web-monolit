import enum
from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Date, Float, JSON, Enum
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

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)  # e.g., "Team3"

    # Relationship to Clients
    clients = relationship("Client", back_populates="organization")


# ==========================================
#       Level 2: The Client
# ==========================================
class Client(Base):
    """
    The customer company. Example: 'SolarEdge', 'Microsoft'.
    """
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)  # e.g., "SolarEdge"

    organization_id = Column(Integer, ForeignKey("organizations.id"))

    # Relationships
    organization = relationship("Organization", back_populates="clients")
    locations = relationship("Location", back_populates="client")


# ==========================================
#       Level 3: The Specific Location (Operational Unit)
# ==========================================
class Location(Base):
    """
    The physical site where shifts happen. Example: 'SolarEdge - Gate 1'.
    This replaces the old 'Workplace' model.
    """
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)  # e.g., "Location 1"

    client_id = Column(Integer, ForeignKey("clients.id"))

    # Configuration Constants (NUM_DAYS, NUM_SHIFTS)
    cycle_length = Column(Integer, default=7)  # e.g., 7 days
    shifts_per_day = Column(Integer, default=3)  # e.g., 3 shifts (Morning, Eve, Night)

    # Relationships
    client = relationship("Client", back_populates="locations")

    # Operational Children
    employees = relationship("Employee", back_populates="location")
    shift_definitions = relationship("ShiftDefinition", back_populates="location")
    assignments = relationship("Assignment", back_populates="location")
    weights = relationship("LocationWeights", back_populates="location", uselist=False)


# ==========================================
#       Level 4: Operational Data (Shifts, Employees)
# ==========================================


class ShiftDefinition(Base):
    """
    Defines the generic 'type' of a shift (e.g., 'Morning', 'Evening').
    This acts as the parent template for the shift.
    """
    __tablename__ = "shift_definitions"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"))

    shift_name = Column(String)  # e.g., "Morning", "Evening"

    # Default staff count (used if no specific daily demand is defined for a certain day)
    default_staff_count = Column(Integer, default=2)

    location = relationship("Location", back_populates="shift_definitions")

    # Relationship to the daily breakdown table
    daily_demands = relationship("ShiftDemand", back_populates="shift_definition")


class ShiftDemand(Base):
    """
    Granular configuration for specific days.
    Allows overriding the default staff count for specific days of the week.
    Example: Friday (5) might need 1 worker, while the rest of the week needs 2.
    """
    __tablename__ = "shift_demands"

    id = Column(Integer, primary_key=True, index=True)
    shift_definition_id = Column(Integer, ForeignKey("shift_definitions.id"))

    # Day of the week (0=Sunday, 6=Saturday)
    day_of_week = Column(Integer)

    # Specific number of workers required for this specific day
    staff_needed = Column(Integer)

    shift_definition = relationship("ShiftDefinition", back_populates="daily_demands")


class LocationWeights(Base):
    """Optimization weights specific to this location."""
    __tablename__ = "location_weights"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"), unique=True)

    # Optimization Penalties
    target_shifts = Column(Integer, default=40)
    rest_gap = Column(Integer, default=40)
    max_nights = Column(Integer, default=5)
    max_mornings = Column(Integer, default=6)
    max_evenings = Column(Integer, default=2)
    min_nights = Column(Integer, default=5)
    min_mornings = Column(Integer, default=4)
    min_evenings = Column(Integer, default=2)
    consecutive_nights = Column(Integer, default=100)

    location = relationship("Location", back_populates="weights")


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"))  # Linked to Location, not Client

    name = Column(String, index=True)
    color = Column(String, default="FFFFFF")
    is_active = Column(Boolean, default=True)

    # History State (For rolling constraints)
    history_streak = Column(Integer, default=0)
    worked_last_fri_night = Column(Boolean, default=False)
    worked_last_sat_noon = Column(Boolean, default=False)
    worked_last_sat_night = Column(Boolean, default=False)

    # Relationships
    location = relationship("Location", back_populates="employees")
    settings = relationship("EmployeeSettings", back_populates="employee", uselist=False)
    constraints = relationship("WeeklyConstraint", back_populates="employee")
    assignments = relationship("Assignment", back_populates="employee")


class EmployeeSettings(Base):
    """Personal preferences for specific employee."""
    __tablename__ = "employee_settings"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), unique=True)

    # Limits
    min_shifts_per_week = Column(Integer, default=0)
    max_shifts_per_week = Column(Integer, default=6)

    # Specific Preference Limits (Mapped from Config)
    max_nights = Column(Integer, nullable=True)
    min_nights = Column(Integer, nullable=True)
    max_mornings = Column(Integer, nullable=True)
    min_mornings = Column(Integer, nullable=True)
    max_evenings = Column(Integer, nullable=True)
    min_evenings = Column(Integer, nullable=True)

    employee = relationship("Employee", back_populates="settings")


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

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"))
    shift_id = Column(Integer, ForeignKey("shift_definitions.id"))  # Specific shift type

    date = Column(Date, index=True)
    constraint_type = Column(String)  # e.g., "cannot_work"

    employee = relationship("Employee", back_populates="constraints")


class Assignment(Base):
    """The final schedule result."""
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id"))
    employee_id = Column(Integer, ForeignKey("employees.id"))
    shift_id = Column(Integer, ForeignKey("shift_definitions.id"))

    date = Column(Date, index=True)

    location = relationship("Location", back_populates="assignments")
    employee = relationship("Employee", back_populates="assignments")
    shift_def = relationship("ShiftDefinition")


# Define user roles using an Enum
class RoleEnum(str, enum.Enum):
    ADMIN = "admin"
    EMPLOYEE = "employee"


class User(Base):
    """
    Handles authentication and authorization (Identity).
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    # Define the access level
    role = Column(Enum(RoleEnum), default=RoleEnum.EMPLOYEE)

    # If the user is an employee, link them to their scheduling data.
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)

    # Relationship to fetch the actual employee scheduling data
    employee = relationship("Employee")