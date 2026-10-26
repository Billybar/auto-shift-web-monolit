import re

from pydantic import BaseModel, ConfigDict, Field, EmailStr, field_validator, BeforeValidator, AfterValidator
from typing import Annotated, Any, List, Literal, Optional, Union
from datetime import date, datetime
from app.core.constants import DEFAULT_LOCATION_WEIGHTS, DEFAULT_POSITION_COLOR
from app.core.enums import ConstraintType, RoleEnum, ConstraintSource, ShiftCategory
from app.core.shift_timing import normalize_clock


def normalize_email(value: str) -> str:
    """
    Canonical form of an email address: trimmed and lowercased.
    Emails are stored this way, so every lookup must normalize its input first.
    """
    return value.strip().lower()


def _strip_if_str(value: Any) -> Any:
    return value.strip() if isinstance(value, str) else value


# EmailStr only lowercases the domain part, so lowercase the whole address after validation
NormalizedEmail = Annotated[EmailStr, BeforeValidator(_strip_if_str), AfterValidator(normalize_email)]


def _normalize_hex_color(value: Any) -> Any:
    """Accepts 'RRGGBB' or '#RRGGBB'; stores uppercase without '#', like Employee.color."""
    if not isinstance(value, str):
        return value
    value = value.strip().lstrip('#').upper()
    if not re.fullmatch(r'[0-9A-F]{6}', value):
        raise ValueError("color must be a 6-digit hex value, e.g. 94A3B8")
    return value


HexColor = Annotated[str, BeforeValidator(_normalize_hex_color)]
PositionName = Annotated[str, BeforeValidator(_strip_if_str), Field(min_length=1, max_length=40)]
# Accepts 'H:MM', 'HH:MM' or 'HH:MM:SS' and stores 'HH:MM'. Only on input schemas, so rows saved
# before the validation still serialize
ShiftHours = Annotated[str, BeforeValidator(normalize_clock)]

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
    target_shifts: int = Field(default=DEFAULT_LOCATION_WEIGHTS["target_shifts"], ge=0)
    rest_gap: int = Field(default=DEFAULT_LOCATION_WEIGHTS["rest_gap"], ge=0)
    consecutive_nights: int = Field(default=DEFAULT_LOCATION_WEIGHTS["consecutive_nights"], ge=0)
    max_nights: int = Field(default=DEFAULT_LOCATION_WEIGHTS["max_nights"], ge=0)
    max_mornings: int = Field(default=DEFAULT_LOCATION_WEIGHTS["max_mornings"], ge=0)
    max_evenings: int = Field(default=DEFAULT_LOCATION_WEIGHTS["max_evenings"], ge=0)
    min_nights: int = Field(default=DEFAULT_LOCATION_WEIGHTS["min_nights"], ge=0)
    min_mornings: int = Field(default=DEFAULT_LOCATION_WEIGHTS["min_mornings"], ge=0)
    min_evenings: int = Field(default=DEFAULT_LOCATION_WEIGHTS["min_evenings"], ge=0)
    secondary_position: int = Field(default=DEFAULT_LOCATION_WEIGHTS["secondary_position"], ge=0)

class LocationWeightsUpdate(LocationWeightsBase):
    """
    Used for updating weights from the UI form.
    Every field is optional: on an existing row only the fields sent are updated,
    and on a new row the missing fields take the defaults.
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
# Positions (employee roles per shift)
# =======================
class PositionCreate(BaseModel):
    location_id: int
    name: PositionName
    color: HexColor = DEFAULT_POSITION_COLOR
    # Omitted: placed after the location's last role
    sort_order: Optional[int] = Field(default=None, ge=0)

class PositionUpdate(BaseModel):
    """Partial update; is_active=False archives the role, True restores it."""
    name: Optional[PositionName] = None
    color: Optional[HexColor] = None
    sort_order: Optional[int] = Field(default=None, ge=0)
    is_active: Optional[bool] = None

class PositionResponse(BaseModel):
    id: int
    location_id: int
    name: str
    color: str
    sort_order: int
    is_active: bool
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
    email: NormalizedEmail
    password: str

    # Roles the employee can fill (active roles of their location). Omitted or empty in a
    # location with exactly one active role: the employee gets that role.
    position_ids: Optional[List[int]] = None
    # Must be one of position_ids; omitted means the first of them
    primary_position_id: Optional[int] = None

class EmployeeResponse(EmployeeBase):
    id: int

    # All the employee's roles, archived ones included
    position_ids: List[int] = []
    primary_position_id: Optional[int] = None

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
    email: Optional[NormalizedEmail] = None
    # (Password update is usually handled in a separate dedicated endpoint for security)

    # Optional Employee fields
    location_id: Optional[int] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    yalam_id: Optional[str] = None
    mishmarot_id: Optional[str] = None
    shiftorg_id: Optional[str] = None

    # Replaces the employee's active roles; archived ones are kept
    position_ids: Optional[List[int]] = None
    # Omitted: the current primary if it is still in the set, otherwise the first id
    primary_position_id: Optional[int] = None

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

class ShiftDefinitionCreate(ShiftDefinitionBase):
    """
    Properties required explicitly for creation.
    """
    location_id: int
    start_time: ShiftHours = Field(..., description="Start time in HH:MM format")
    end_time: ShiftHours = Field(..., description="End time in HH:MM format")

class ShiftDefinitionUpdate(BaseModel):
    """
    Properties allowed to be updated.
    We don't inherit from Base here because all fields must be Optional for a PATCH/PUT request.
    Usually, location_id is not allowed to be updated once a shift is created.
    """
    name: Optional[str] = None
    start_time: Optional[ShiftHours] = None
    end_time: Optional[ShiftHours] = None

class ShiftDefinitionResponse(ShiftDefinitionBase):
    """
    Properties returned to the client.
    Inherits name, start_time, end_time from Base.
    """
    id: int
    location_id: int
    # From the start time: morning from 04:00, evening from 12:00, night from 21:00.
    # None for a shift saved with invalid hours
    category: Optional[ShiftCategory] = None

    # Pydantic V2 syntax for ORM mode
    model_config = ConfigDict(from_attributes=True)


# =======================
# Shifts Demand
# =======================
class DemandTemplateCell(BaseModel):
    """One cell of a location's weekly template: a shift needs N people in a role on a weekday."""
    shift_id: int
    position_id: int
    day_of_week: int = Field(..., ge=0, le=6, description="0=Sunday, 6=Saturday")
    required_employees: int = Field(..., ge=0, le=50, description="Number of employees needed")

class DemandTemplateUpdate(BaseModel):
    """The full desired template for the location's active roles; cells left out (or 0) are cleared."""
    cells: List[DemandTemplateCell]

class DemandTemplateResponse(BaseModel):
    location_id: int
    # Only cells above 0, for active roles
    cells: List[DemandTemplateCell]

class ShiftDemandOverrideSet(BaseModel):
    """Payload for setting one role's demand on a specific date."""
    position_id: int
    required_employees: int = Field(..., ge=0, le=50, description="Number of employees needed on this specific date")

class ShiftDayDemandResponse(BaseModel):
    """One role's demand on one date, merging template and override."""
    shift_id: int
    position_id: int
    date: date
    required_employees: int
    is_override: bool

# =======================
# Schedule Publication
# =======================
class SchedulePublicationUpdate(BaseModel):
    location_id: int
    week_start_date: date
    is_published: bool

    @field_validator('week_start_date')
    @classmethod
    def validate_sunday(cls, v: date) -> date:
        if v.weekday() != 6:
            raise ValueError("week_start_date must be a Sunday")
        return v

class SchedulePublicationResponse(BaseModel):
    location_id: int
    week_start_date: date
    is_published: bool
    published_at: Optional[datetime] = None
    published_by_user_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

# =======================
# Assignment
# =======================
class AssignmentCreate(BaseModel):
    employee_id: int
    shift_id: int
    date: date
    # Installed mobile builds never send it: an existing row keeps its role, a new one gets one inferred
    position_id: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None

class AssignmentResponse(BaseModel):
    employee_id: int
    shift_id: int
    date: date
    position_id: int
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class AssignmentSyncResponse(BaseModel):
    added: int
    # Rows whose role or hours changed (kept in place, same id)
    updated: int
    removed: int
    unchanged: int

# =======================
# Auto-assign (engine) result
# =======================
class DraftAssignment(BaseModel):
    location_id: int
    employee_id: int
    shift_id: int
    position_id: int
    date: date

class UnfilledSlot(BaseModel):
    shift_id: int
    position_id: int
    date: date
    missing: int

class EmployeeSkippedWarning(BaseModel):
    """Active employee with no active role: left out of auto-assign."""
    code: Literal["employee_skipped_no_positions"] = "employee_skipped_no_positions"
    employee_id: int

class MustWorkIgnoredWarning(BaseModel):
    """MUST_WORK on a shift that needs none of the employee's roles that day."""
    code: Literal["must_work_ignored"] = "must_work_ignored"
    employee_id: int
    shift_id: int
    date: date

class MinShiftsLoweredWarning(BaseModel):
    """The weekly minimum was more than the days the employee can work, so it was lowered."""
    code: Literal["min_shifts_lowered"] = "min_shifts_lowered"
    employee_id: int
    requested: int
    applied: int

AutoScheduleWarning = Annotated[
    Union[EmployeeSkippedWarning, MustWorkIgnoredWarning, MinShiftsLoweredWarning],
    Field(discriminator="code"),
]

class AutoScheduleResponse(BaseModel):
    status: Literal["OPTIMAL", "FEASIBLE", "FAILED"]
    # Set when FAILED: 'infeasible' (the hard rules contradict each other) or 'time_limit'
    failure_reason: Optional[Literal["infeasible", "time_limit"]] = None
    # Total penalty of the draft (lower is better); None when FAILED
    penalty_score: Optional[int] = None
    draft_assignments: List[DraftAssignment] = []
    unfilled_slots: List[UnfilledSlot] = []
    warnings: List[AutoScheduleWarning] = []

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

# wrapper schema for Submitting Constraints + Note
class SyncConstraintsPayload(BaseModel):
    constraints: List[WeeklyConstraintCreate]
    note: Optional[str] = None

# wrapper schema for Reading Constraints + Note (For Manager/Employee view)
class WeeklyDataResponse(BaseModel):
    constraints: List[WeeklyConstraintResponse]
    note: Optional[str] = None

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

# initial forgot-password request
class ForgotPasswordRequest(BaseModel):
    email: NormalizedEmail

# submitting the OTP and the new password
class ResetPasswordRequest(BaseModel):
    email: NormalizedEmail
    # OTP must be exactly 6 characters long
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")
    # Enforcing a minimum length for the new password
    new_password: str = Field(..., min_length=8, description="New password for the user")

# =======================
# Users
# =======================
class UserBase(BaseModel):
    email: NormalizedEmail
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
