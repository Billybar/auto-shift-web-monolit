// src/types/index.ts


// Define the roles exactly as they will be represented in the system/JWT
export const UserRole = {
  EMPLOYEE: 'employee',
  SCHEDULER: 'scheduler',
  MANAGER: 'manager',
  ADMIN: 'admin',
} as const;

// Extract the type from the object values (replaces the type enum behavior)
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export interface User {
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  employee_id: number;
  locations?: LocationData[];
}

export interface UserResponse {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Data returned from the FastAPI login endpoint
export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  new_password: string;
}

export interface GenericResponse {
  message: string;
}

/**
 * Matches the EmployeeResponse schema from the FastAPI backend.
 */
export interface Employee {
    id: number;
    user?: UserResponse | null;
    location_id: number;
    color: string;
    is_active: boolean;
    notes?: string | null;
    settings?: EmployeeSettings | null;

    // External Integrations
    yalam_id?: string | null;
    mishmarot_id?: string | null;
    shiftorg_id?: string | null;

    // Roles (תפקידים) the employee can fill, archived ones included
    position_ids: number[];
    primary_position_id: number | null;
}

/**
 * Matches the EmployeeCreate schema from the FastAPI backend.
 * Used when sending a POST request to create a new employee.
 */
export interface EmployeeCreate {
    email: string;
    password?: string; // Optional here because the same type might be used in generic forms, but required in the actual API call
    first_name: string;
    last_name: string;

    location_id: number;
    notes?: string | null;
    color: string;
    is_active: boolean;

    // External Integrations
    yalam_id?: string | null;
    mishmarot_id?: string | null;
    shiftorg_id?: string | null;

    // Omitted or empty in a location with one role: the employee gets that role
    position_ids?: number[];
    // One of position_ids; omitted means the first of them
    primary_position_id?: number | null;
}

export interface EmployeeUpdate {
    email?: string;
    first_name?: string;
    last_name?: string;
    location_id?: number;
    color?: string;
    is_active?: boolean;
    notes?: string | null;
    yalam_id?: string | null;
    mishmarot_id?: string | null;
    shiftorg_id?: string | null;
    // Replaces the active roles (archived ones are kept)
    position_ids?: number[];
    primary_position_id?: number | null;
}

export interface EmployeeSettings {
    id: number;
    min_shifts_per_week: number;
    max_shifts_per_week: number;
    max_nights?: number;
    min_nights?: number;
    max_mornings?: number;
    min_mornings?: number;
    max_evenings?: number;
    min_evenings?: number;
}

export interface EmployeeSettingsUpdate {
    min_shifts_per_week?: number;
    max_shifts_per_week?: number;
    max_nights?: number;
    min_nights?: number;
    max_mornings?: number;
    min_mornings?: number;
    max_evenings?: number;
    min_evenings?: number;
}

// --------------------------------
// --- Location & Weights Types ---
// --------------------------------
export interface Weights {
    id: number;
    target_shifts: number;
    rest_gap: number;
    max_nights: number;
    max_mornings: number;
    max_evenings: number;
    min_nights: number;
    min_mornings: number;
    min_evenings: number;
    consecutive_nights: number;
    secondary_position: number;
}

export interface WeightsUpdate {
    target_shifts?: number;
    rest_gap?: number;
    max_nights?: number;
    max_mornings?: number;
    max_evenings?: number;
    min_nights?: number;
    min_mornings?: number;
    min_evenings?: number;
    consecutive_nights?: number;
    secondary_position?: number;
}

// --------------------------------
// --- Positions (employee roles per shift) ---
// --------------------------------

/**
 * A role an employee fills in a shift (e.g. אחמ"ש, מאבטח), defined per location.
 * Matches PositionResponse. Called "position" because "role" is the login permission (UserRole).
 */
export interface Position {
    id: number;
    location_id: number;
    name: string;
    color: string; // hex without '#'
    sort_order: number;
    is_active: boolean; // false = archived: kept for history, no demand, not auto-assigned
}

export interface PositionCreate {
    location_id: number;
    name: string;
    color?: string;
    sort_order?: number;
}

export interface PositionUpdate {
    name?: string;
    color?: string;
    sort_order?: number;
    is_active?: boolean;
}

export interface LocationData {
    id: number;
    name: string;
    client_id: number;
    cycle_length: number;
    shifts_per_day: number;
    weights?: Weights;
}

// --------------------------------
// --- Constraints Types ---
// --------------------------------

export type ConstraintType = 'cannot_work' | 'must_work';

// A stored constraint covers a constraints-board row (group); the API returns it once per shift of the row
export interface WeeklyConstraint {
    id: number;
    employee_id: number;
    group_id: number;
    shift_id: number;
    date: string; // "YYYY-MM-DD"
    constraint_type: ConstraintType
}

export interface WeeklyConstraintCreate {
    employee_id: number;
    group_id: number;
    date: string;
    constraint_type: ConstraintType
}

export interface SyncConstraintsPayload {
    constraints: WeeklyConstraintCreate[];
    note?: string | null;
}

export interface WeeklyDataResponse {
    constraints: WeeklyConstraint[];
    note?: string | null;
}

export interface SchedulePublication {
    location_id: number;
    week_start_date: string; // "YYYY-MM-DD"
    is_published: boolean;
    published_at?: string | null;
    published_by_user_id?: number | null;
}

export interface Assignment {
    id?: number;          // optional for new shift created in the UI (there is no ID until we send to DB)
    location_id?: number;
    employee_id: number;
    shift_id: number;
    position_id: number;  // the role filled in this shift; the slot owns it
    date: string;         // comes from server as "YYYY-MM-DD"
    start_time?: string | null;
    end_time?: string | null;
}

// Result of POST /api/assignments/ (Smart Sync)
export interface AssignmentSyncResult {
    added: number;
    updated: number; // role or hours changed in place
    removed: number;
    unchanged: number;
}

// From the start time: morning from 04:00, evening from 12:00, night from 21:00
export type ShiftCategory = 'morning' | 'evening' | 'night';

export interface ShiftDefinition {
    id: number;
    name: string;
    start_time: string;
    end_time: string;
    location_id: number;
    // The constraints-board row this shift is marked through
    constraint_group_id: number;
    category: ShiftCategory | null; // null when the saved hours are invalid
}

// A row of the constraints board: one or more shifts that employees mark together
export interface ConstraintGroup {
    id: number;
    location_id: number;
    name: string | null; // null: the board shows the shift names
    shift_ids: number[]; // in the order of the work day
}

export interface ConstraintGroupMergeResult {
    group: ConstraintGroup;
    moved: number; // constraints moved into the merged row
    conflicts: number; // constraints not moved (the row already had one that day), kept as history
}

// One role's demand on one date (template merged with the date's override)
export interface ShiftDayDemand {
    shift_id: number;
    position_id: number;
    date: string; // "YYYY-MM-DD"
    required_employees: number;
    is_override: boolean;
}

// One cell of a location's weekly template
export interface DemandTemplateCell {
    shift_id: number;
    position_id: number;
    day_of_week: number; // 0 = Sunday, 6 = Saturday
    required_employees: number;
}

export interface DemandTemplate {
    location_id: number;
    cells: DemandTemplateCell[]; // only cells above 0
}

export interface LocationWeights {
    id?: number;
    location_id?: number;
    target_shifts: number;
    rest_gap: number;
    consecutive_nights: number;
    max_nights: number;
    max_mornings: number;
    max_evenings: number;
    min_nights: number;
    min_mornings: number;
    min_evenings: number;
    secondary_position: number;
}
// Result of POST /api/constraints/import-html (constraints_import_service.process_external_constraints)
export interface ImportConstraintsResult {
    status: 'success';
    processed_employees_count: number;
    imported_notes_count: number;
    // External IDs found in the file that no employee in this location is linked to
    missing_employees_ids: string[];
}

// A role slot auto-assign could not fill
export interface UnfilledSlot {
    shift_id: number;
    position_id: number;
    date: string;
    missing: number;
}

// Inputs the engine set aside, keyed on `code`
export type AutoScheduleWarning =
    | { code: 'employee_skipped_no_positions'; employee_id: number }
    | { code: 'must_work_ignored'; employee_id: number; shift_id: number; date: string }
    | { code: 'min_shifts_lowered'; employee_id: number; requested: number; applied: number };

// Result of POST /api/assignments/auto-generate/{location_id} (weekly_schedule_service.generate_weekly_schedule)
export interface AutoScheduleResult {
    status: 'OPTIMAL' | 'FEASIBLE' | 'FAILED';
    // Why FAILED: the hard rules contradict each other, or the time ran out
    failure_reason: 'infeasible' | 'time_limit' | null;
    penalty_score: number | null; // Total penalties; lower is better
    draft_assignments: Assignment[]; // Empty when FAILED
    unfilled_slots: UnfilledSlot[];
    warnings: AutoScheduleWarning[];
}

// A placement on the board: the employee's row in this shift and date
export interface ScheduleCell {
    shift_id: number;
    date: string;
}

// Hard rules the engine never breaks, keyed on `code`. `cells`: the placements to mark (empty for weekly totals)
export type ScheduleViolation = { employee_id: number; cells: ScheduleCell[] } & (
    | { code: 'two_shifts_same_day'; date: string }
    // Negative when the shifts overlap; from_previous_week: counted from last week's last shift
    | { code: 'short_rest'; rest_minutes: number; from_previous_week: boolean }
    | { code: 'work_streak'; days: number; limit: number }
    | { code: 'cannot_work'; shift_id: number; date: string }
    | { code: 'must_work_missed'; shift_ids: number[]; date: string }
    | { code: 'max_shifts'; count: number; limit: number }
    | { code: 'min_shifts'; count: number; limit: number }
    | { code: 'position_not_held'; position_id: number; shift_id: number; date: string }
);

// Result of POST /api/assignments/check/{location_id} (weekly_schedule_service.check_weekly_schedule); hard rules only
export interface ScheduleCheckResult {
    violations: ScheduleViolation[];
}

// --- API errors ---

// Machine-readable codes the backend attaches to failures a user can act on.
// Mirrors ErrorCode in app/core/enums.py; keep the two in sync.
export type ErrorCode =
    | 'location_not_found'
    | 'schedule_no_active_employees'
    | 'import_invalid_file_type'
    | 'import_unreadable_file'
    | 'import_unsupported_encoding'
    | 'import_source_not_supported'
    | 'import_no_shift_definitions'
    | 'import_parse_failed'
    | 'position_name_taken'
    | 'position_in_use'
    | 'position_invalid'
    | 'employee_has_no_positions'
    | 'schedule_no_staffable_employees'
    | 'schedule_concurrent_edit'
    | 'shift_invalid_hours';

// Error body returned by the API. `detail` is a developer-facing string, or a list of
// field errors for request validation (422). `code` and `params` come only with AppError.
export interface ApiErrorBody {
    detail?: string | { loc: (string | number)[]; msg: string; type: string }[];
    code?: ErrorCode;
    params?: Record<string, unknown>;
}
