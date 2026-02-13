from pydantic import BaseModel
from typing import List, Optional, Tuple, Dict, Any
from datetime import date

# =======================
# Organization & Hierarchy
# =======================
class OrganizationBase(BaseModel):
    name: str

class OrganizationCreate(OrganizationBase):
    pass

class OrganizationResponse(OrganizationBase):
    id: int
    class Config:
        from_attributes = True

class ClientBase(BaseModel):
    name: str
    organization_id: int

class ClientCreate(ClientBase):
    pass

class ClientResponse(ClientBase):
    id: int
    class Config:
        from_attributes = True

class LocationBase(BaseModel):
    name: str
    client_id: int
    cycle_length: int = 7
    shifts_per_day: int = 3

class LocationCreate(LocationBase):
    pass

class LocationResponse(LocationBase):
    id: int
    class Config:
        from_attributes = True

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
    # We can add more fields if needed
    class Config:
        from_attributes = True

# =======================
# Shifts
# =======================
class ShiftDefinitionResponse(BaseModel):
    id: int
    shift_name: str
    default_staff_count: int
    class Config:
        from_attributes = True

class ShiftDemandResponse(BaseModel):
    day_of_week: int
    staff_needed: int
    class Config:
        from_attributes = True

class AssignmentResponse(BaseModel):
    employee_id: int
    shift_id: int
    date: date
    class Config:
        from_attributes = True