from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Tuple, Dict, Any
from datetime import date
from enum import Enum

# =======================
# Organization & Hierarchy
# =======================
class OrganizationBase(BaseModel):
    name: str

class OrganizationCreate(OrganizationBase):
    pass

class OrganizationResponse(OrganizationBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class ClientBase(BaseModel):
    name: str
    organization_id: int

class ClientCreate(ClientBase):
    pass

class ClientResponse(ClientBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


# =======================
# Optimization Settings & Weights
# =======================

class EmployeeSettingsUpdate(BaseModel):
    min_shifts_per_week: Optional[int] = None
    max_shifts_per_week: Optional[int] = None
    max_nights: Optional[int] = None
    min_nights: Optional[int] = None
    max_mornings: Optional[int] = None
    min_mornings: Optional[int] = None
    max_evenings: Optional[int] = None
    min_evenings: Optional[int] = None

class EmployeeSettingsResponse(BaseModel):
    id: int
    min_shifts_per_week: int
    max_shifts_per_week: int
    max_nights: Optional[int]
    min_nights: Optional[int]
    max_mornings: Optional[int]
    min_mornings: Optional[int]
    max_evenings: Optional[int]
    min_evenings: Optional[int]
    model_config = ConfigDict(from_attributes=True)

# =======================
# Weights (Now per Location)
# =======================
class WeightsUpdate(BaseModel):
    target_shifts: Optional[int] = None
    rest_gap: Optional[int] = None
    max_nights: Optional[int] = None
    max_mornings: Optional[int] = None
    max_evenings: Optional[int] = None
    min_nights: Optional[int] = None
    min_mornings: Optional[int] = None
    min_evenings: Optional[int] = None
    consecutive_nights: Optional[int] = None

class WeightsResponse(BaseModel):
    id: int
    target_shifts: int
    rest_gap: int
    max_nights: int
    max_mornings: int
    max_evenings: int
    min_nights: int
    min_mornings: int
    min_evenings: int
    consecutive_nights: int
    model_config = ConfigDict(from_attributes=True)

# =======================
# Locations
# =======================
class LocationBase(BaseModel):
    name: str
    client_id: int
    cycle_length: int = 7
    shifts_per_day: int = 3

class LocationCreate(LocationBase):
    pass

class LocationResponse(LocationBase):
    id: int
    # Embed weights directly into the location response
    weights: Optional[WeightsResponse] = None
    model_config = ConfigDict(from_attributes=True)

# =======================
# Employees
# =======================
class EmployeeBase(BaseModel):
    name: str
    location_id: int # Changed from workplace_id
    color: Optional[str] = "FFFFFF"
    is_active: Optional[bool] = True

class EmployeeCreate(EmployeeBase):
    pass

class EmployeeResponse(EmployeeBase):
    id: int
    history_streak: int
    # Embed settings directly into the employee response
    settings: Optional[EmployeeSettingsResponse] = None
    model_config = ConfigDict(from_attributes=True)

# =======================
# Shifts
# =======================
class ShiftDefinitionResponse(BaseModel):
    id: int
    shift_name: str
    default_staff_count: int
    model_config = ConfigDict(from_attributes=True)

class ShiftDemandResponse(BaseModel):
    day_of_week: int
    staff_needed: int
    model_config = ConfigDict(from_attributes=True)

class AssignmentCreate(BaseModel):
    employee_id: int
    shift_id: int
    date: date

class AssignmentResponse(BaseModel):
    employee_id: int
    shift_id: int
    date: date
    model_config = ConfigDict(from_attributes=True)


# =======================
# Constraints
# =======================
class WeeklyConstraintBase(BaseModel):
    employee_id: int
    shift_id: int
    date: date
    constraint_type: str

class WeeklyConstraintCreate(WeeklyConstraintBase):
    pass

class WeeklyConstraintResponse(WeeklyConstraintBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

# Define Enum for Pydantic validation (must match the SQLAlchemy Enum)
class RoleEnum(str, Enum):
    ADMIN = "admin"
    EMPLOYEE = "employee"

# =======================
# Authentication & Tokens
# =======================
class Token(BaseModel):
    """
    Schema for the token response payload.
    """
    access_token: str
    token_type: str

class TokenData(BaseModel):
    """
    Schema for the data encoded inside the JWT token.
    """
    username: Optional[str] = None
    role: Optional[RoleEnum] = None
    employee_id: Optional[int] = None

# =======================
# Users
# =======================
class UserBase(BaseModel):
    username: str
    role: RoleEnum = RoleEnum.EMPLOYEE
    # employee_id can be None if the user is an Admin without a shift profile
    employee_id: Optional[int] = None

class UserCreate(UserBase):
    """
    Schema used when creating a new user.
    Includes the plain text password.
    """
    password: str

class UserResponse(UserBase):
    """
    Schema used when returning user data.
    Never expose the hashed_password here!
    """
    id: int

    model_config = ConfigDict(from_attributes=True)