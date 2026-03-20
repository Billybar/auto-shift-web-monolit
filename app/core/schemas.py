from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional
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
    target_shifts: Optional[int] = None
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
    target_shifts: Optional[int]
    max_nights: Optional[int]
    min_nights: Optional[int]
    max_mornings: Optional[int]
    min_mornings: Optional[int]
    max_evenings: Optional[int]
    min_evenings: Optional[int]
    model_config = ConfigDict(from_attributes=True)

# =======================
# Location Weights
# =======================

class LocationWeightsBase(BaseModel):
    """
    Base properties for location optimization weights.
    We use ge=0 to ensure the user cannot send negative penalty weights.
    """
    target_shifts: int = Field(default=40, ge=0)
    rest_gap: int = Field(default=40, ge=0)
    consecutive_nights: int = Field(default=100, ge=0)
    max_nights: int = Field(default=5, ge=0)
    max_mornings: int = Field(default=6, ge=0)
    max_evenings: int = Field(default=2, ge=0)
    min_nights: int = Field(default=0, ge=0)
    min_mornings: int = Field(default=0, ge=0)
    min_evenings: int = Field(default=0, ge=0)

class LocationWeightsUpdate(LocationWeightsBase):
    """
    Used for updating weights from the UI form.
    Inherits all fields as required since the UI sends the full state.
    """
    pass

class LocationWeightsResponse(LocationWeightsBase):
    """
    Returned to the client after fetch/update.
    """
    id: int
    location_id: int

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
    weights: Optional["LocationWeightsResponse"] = None
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
# Shifts Definition
# =======================

class ShiftDefinitionBase(BaseModel):
    """
    Shared properties for all Shift Definition schemas.
    """
    name: str = Field(..., description="Name of the shift, e.g., Morning, Evening")
    start_time: str = Field(..., description="Start time in HH:MM format")
    end_time: str = Field(..., description="End time in HH:MM format")
    # If you have a default staff count in your DB, add it to the base:
    # default_staff_count: int = Field(default=1)


class ShiftDefinitionCreate(ShiftDefinitionBase):
    """
    Properties required explicitly for creation.
    """
    location_id: int


class ShiftDefinitionUpdate(BaseModel):
    """
    Properties allowed to be updated.
    We don't inherit from Base here because all fields must be Optional for a PATCH/PUT request.
    Usually, location_id is not allowed to be updated once a shift is created.
    """
    name: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class ShiftDefinitionResponse(ShiftDefinitionBase):
    """
    Properties returned to the client.
    Inherits name, start_time, end_time from Base.
    """
    id: int
    location_id: int

    # Pydantic V2 syntax for ORM mode
    model_config = ConfigDict(from_attributes=True)


# =======================
# Shifts Demand
# =======================
class ShiftDemandBase(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6, description="0=Sunday, 6=Saturday")
    required_employees: int = Field(..., ge=0, description="Number of employees needed")

class ShiftDemandCreate(ShiftDemandBase):
    pass

class ShiftDemandUpdate(BaseModel):
    demands: List[ShiftDemandBase]

class ShiftDemandResponse(ShiftDemandBase):
    id: int
    shift_definition_id: int

    model_config = ConfigDict(from_attributes=True)

# =======================
# Assignment
# =======================
class AssignmentCreate(BaseModel):
    employee_id: int
    shift_id: int
    date: date

class AssignmentResponse(BaseModel):
    employee_id: int
    shift_id: int
    date: date
    model_config = ConfigDict(from_attributes=True)

# Define Enum for Pydantic validation (must match the SQLAlchemy Enum)
class RoleEnum(str, Enum):
    ADMIN = "admin"
    EMPLOYEE = "employee"

class ConstraintTypeEnum(str, Enum):
    CANNOT_WORK = "cannot_work"
    MUST_WORK = "must_work"
    # You can easily extend this later (e.g., PREFERS_TO_WORK, PREFERS_NOT_TO_WORK)



# =======================
# Constraints
# =======================
class WeeklyConstraintBase(BaseModel):
    employee_id: int
    shift_id: int
    date: date
    constraint_type: ConstraintTypeEnum

class WeeklyConstraintCreate(WeeklyConstraintBase):
    pass

class WeeklyConstraintResponse(WeeklyConstraintBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

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