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

# A shift's type, derived from its start time (see app/core/shift_timing.py)
class ShiftCategory(str, enum.Enum):
    MORNING = "morning"
    EVENING = "evening"
    NIGHT = "night"

# Define allowed external sources
class ConstraintSource(str, enum.Enum):
    YALAM = "yalam"
    MISHMAROT = "mishmarot"
    SHIFT_ORG = "shiftorg"


# failures a user can act on.
# Clients map them to their own (Hebrew) messages; keep in sync with ErrorCode in frontend/src/types/index.ts.
class ErrorCode(str, enum.Enum):
    LOCATION_NOT_FOUND = "location_not_found"
    SCHEDULE_NO_ACTIVE_EMPLOYEES = "schedule_no_active_employees"
    IMPORT_INVALID_FILE_TYPE = "import_invalid_file_type"
    IMPORT_UNREADABLE_FILE = "import_unreadable_file"
    IMPORT_UNSUPPORTED_ENCODING = "import_unsupported_encoding"
    IMPORT_SOURCE_NOT_SUPPORTED = "import_source_not_supported"
    IMPORT_NO_SHIFT_DEFINITIONS = "import_no_shift_definitions"
    IMPORT_PARSE_FAILED = "import_parse_failed"
    POSITION_NAME_TAKEN = "position_name_taken"
    POSITION_IN_USE = "position_in_use"
    POSITION_INVALID = "position_invalid"
    EMPLOYEE_HAS_NO_POSITIONS = "employee_has_no_positions"
    SCHEDULE_NO_STAFFABLE_EMPLOYEES = "schedule_no_staffable_employees"
    SCHEDULE_CONCURRENT_EDIT = "schedule_concurrent_edit"
    SHIFT_INVALID_HOURS = "shift_invalid_hours"