// mobile/src/types/index.ts

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
    position_ids?: number[];
    primary_position_id?: number | null;
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
    location_id: number;
    employee_id: number;
    shift_id: number;
    // The role filled in this shift. Always set by the server; left out of a new row so the
    // server picks the open role for the employee
    position_id?: number;
    date: string;         // comes from server as "YYYY-MM-DD"
    start_time?: string | null;  // null/missing = the shift's default hours
    end_time?: string | null;
}

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
    is_active: boolean; // false = archived
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

// One role's demand on one date
export interface ShiftDayDemand {
    shift_id: number;
    position_id: number;
    date: string; // "YYYY-MM-DD"
    required_employees: number;
    is_override: boolean;
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

// Error body returned by the API. `detail` is a developer-facing string, or a list of
// field errors for request validation (422). `code` and `params` come only with the backend's AppError
// (see ErrorCode in app/core/enums.py; no endpoint the app calls sends one yet).
export interface ApiErrorBody {
    detail?: string | { loc: (string | number)[]; msg: string; type: string }[];
    code?: string;
    params?: Record<string, unknown>;
}