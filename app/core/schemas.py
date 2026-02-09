# app/schemas.py
from pydantic import BaseModel
from typing import List, Optional
from datetime import date


# --- Employee Schemas ---
class EmployeeBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    color: Optional[str] = "FFFFFF"
    is_active: bool = True


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    # All fields optional for updates
    name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None


class EmployeeResponse(EmployeeBase):
    id: int

    class Config:
        from_attributes = True  # Allows Pydantic to read SQLAlchemy models


# --- Constraint Schemas ---
class ConstraintCreate(BaseModel):
    employee_id: int
    shift_id: int
    date: date
    constraint_type: str  # "cannot_work", "must_work", etc.


# --- Weights Schemas ---
class WeightsUpdate(BaseModel):
    target_shifts: Optional[int] = None
    rest_gap: Optional[int] = None
    max_nights: Optional[int] = None
    # ... add other fields from WorkplaceWeights as needed