from pydantic import BaseModel, ConfigDict, Field, EmailStr
from typing import List, Optional
from datetime import date, datetime
from app.core.enums import ConstraintType, RoleEnum, ConstraintSource

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
    location_id: int # Changed from workplace_id
    color: Optional[str] = "FFFFFF"
    is_active: Optional[bool] = True
    notes: Optional[str] = None

    # NEW: External Integrations (Optional)
    yalam_id: Optional[str] = None
    mishmarot_id: Optional[str] = None
    shiftorg_id: Optional[str] = None

class EmployeeCreate(EmployeeBase):
    """
    Unified schema for creating an Employee and their associated User.
    Inherits Employee fields (location_id, notes, etc.) from EmployeeBase,
    and adds the required User fields here.
    """
    first_name: str
    last_name: str
    email: EmailStr
    password: str

class EmployeeResponse(EmployeeBase):
    id: int

    # Include related User data automatically
    user: Optional["UserResponse"] = None

    # Embed settings directly into the employee response
    settings: Optional[EmployeeSettingsResponse] = None
    model_config = ConfigDict(from_attributes=True)


class EmployeeUpdate(BaseModel):
    """
    Unified schema for updating an Employee and/or their associated User.
    All fields are optional because a PATCH/PUT might only update one field.
    """
    # Optional User fields
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    # (Password update is usually handled in a separate dedicated endpoint for security)

    # Optional Employee fields
    location_id: Optional[int] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    yalam_id: Optional[str] = None
    mishmarot_id: Optional[str] = None
    shiftorg_id: Optional[str] = None

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

# =======================
# Constraints
# =======================
class WeeklyConstraintBase(BaseModel):
    employee_id: int
    shift_id: int
    date: date
    constraint_type: ConstraintType

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
    email: Optional[str] = None
    role: Optional[RoleEnum] = None
    employee_id: Optional[int] = None

# =======================
# Users
# =======================
class UserBase(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    role: RoleEnum = RoleEnum.EMPLOYEE
    # Organization ID is required for Managers/Schedulers, None for Global Admin
    organization_id: Optional[int] = None
    # employee_id can be None if the user is an Admin without a shift profile
    employee_id: Optional[int] = None

class UserCreate(UserBase):
    """
    Schema used when creating a new user.
    Includes the plain text password.
    """
    password: str

    # Optional lists of IDs to assign specific access during creation
    client_ids: Optional[List[int]] = []
    location_ids: Optional[List[int]] = []

class UserResponse(UserBase):
    """
    Schema used when returning user data.
    Never expose the hashed_password here!
    """
    id: int

    created_at: datetime
    last_login: Optional[datetime] = None

    # Nested relationships populated by SQLAlchemy's ORM mode
    clients: List[ClientResponse] = []
    locations: List[LocationResponse] = []

    model_config = ConfigDict(from_attributes=True)
