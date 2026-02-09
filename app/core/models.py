import enum
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, ForeignKey, Boolean, Date, DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all schema models."""
    pass


class Workplace(Base):
    """Root entity: A company or site location."""
    __tablename__ = "workplaces"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    num_days_in_cycle: Mapped[int] = mapped_column(default=7)
    num_shifts_per_day: Mapped[int] = mapped_column(default=3)

    # Relationships
    employees: Mapped[List["Employee"]] = relationship(back_populates="workplace", cascade="all, delete-orphan")
    shifts: Mapped[List["ShiftDefinition"]] = relationship(back_populates="workplace", cascade="all, delete-orphan")


class Employee(Base):
    """Individual staff members."""
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    workplace_id: Mapped[int] = mapped_column(ForeignKey("workplaces.id"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(100), nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="FFFFFF")
    is_active: Mapped[bool] = mapped_column(default=True)

    history_streak: Mapped[int] = mapped_column(default=0)
    worked_last_fri_night: Mapped[bool] = mapped_column(default=False)
    worked_last_sat_noon: Mapped[bool] = mapped_column(default=False)
    worked_last_sat_night: Mapped[bool] = mapped_column(default=False)

    # Relationships
    workplace: Mapped["Workplace"] = relationship(back_populates="employees")
    assignments: Mapped[List["Assignment"]] = relationship(back_populates="employee")
    settings: Mapped["EmployeeSettings"] = relationship(back_populates="employee", uselist=False)


class ShiftDefinition(Base):
    """Configuration of shifts (e.g., Morning, Night) for each workplace."""
    __tablename__ = "shift_definitions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    workplace_id: Mapped[int] = mapped_column(ForeignKey("workplaces.id"))
    shift_name: Mapped[str] = mapped_column(String(50))  # e.g., 'Morning'
    num_staff: Mapped[int] = mapped_column(default=1)

    # Relationships
    workplace: Mapped["Workplace"] = relationship(back_populates="shifts")


class Assignment(Base):
    """The final result produced by OR-Tools: who works where and when."""
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    workplace_id: Mapped[int] = mapped_column(ForeignKey("workplaces.id"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    shift_id: Mapped[int] = mapped_column(ForeignKey("shift_definitions.id"))
    date: Mapped[datetime] = mapped_column(Date, nullable=False)

    # Relationships
    employee: Mapped["Employee"] = relationship(back_populates="assignments")


# Define types of constraints for better code clarity
class ConstraintType(enum.Enum):
    CANNOT_WORK = "cannot_work"  # Absolute block
    MUST_WORK = "must_work"
    PREFER_NOT = "prefer_not"  # Soft constraint (penalty)
    PREFER_YES = "prefer_yes"  # Soft constraint (reward)


class EmployeeSettings(Base):
    """Specific contract/preference settings for an employee."""
    __tablename__ = "employee_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    min_shifts_per_week: Mapped[int] = mapped_column(default=0)
    max_shifts_per_week: Mapped[int] = mapped_column(default=5)

    employee: Mapped["Employee"] = relationship()


class WeeklyConstraint(Base):
    """Dynamic weekly requests from employees."""
    __tablename__ = "weekly_constraints"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"))
    shift_id: Mapped[int] = mapped_column(ForeignKey("shift_definitions.id"))
    date: Mapped[datetime] = mapped_column(Date)
    # Using Enum to ensure only specific types of constraints are entered
    constraint_type: Mapped[ConstraintType] = mapped_column(default=ConstraintType.CANNOT_WORK)


class WorkplaceWeights(Base):
    """Optimization weights/priorities for the solver per workplace."""
    __tablename__ = "workplace_weights"

    id: Mapped[int] = mapped_column(primary_key=True)
    workplace_id: Mapped[int] = mapped_column(ForeignKey("workplaces.id"))

    target_shifts: Mapped[int] = mapped_column(default=40)
    rest_gap: Mapped[int] = mapped_column(default=40)

    # Penalty weights for exceeding limits
    max_nights: Mapped[int] = mapped_column(default=5)
    max_mornings: Mapped[int] = mapped_column(default=6)
    max_evenings: Mapped[int] = mapped_column(default=2)

    # Penalty weights for not meeting minimums
    min_nights: Mapped[int] = mapped_column(default=5)
    min_mornings: Mapped[int] = mapped_column(default=4)
    min_evenings: Mapped[int] = mapped_column(default=2)

    # Specific logic weights
    consecutive_nights: Mapped[int] = mapped_column(default=100)