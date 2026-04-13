# Define user roles using an Enum
import enum


class RoleEnum(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    SCHEDULER = "scheduler"
    EMPLOYEE = "employee"


class ConstraintType(str, enum.Enum):
    CANNOT_WORK = "cannot_work"
    MUST_WORK = "must_work"
    PREFER_NOT = "prefer_not"
    PREFER_TO = "prefer_to"

# Define allowed external sources
class ConstraintSource(str, enum.Enum):
    YALAM = "yalam"
    MISHMAROT = "mishmarot"
    SHIFT_ORG = "shiftorg"