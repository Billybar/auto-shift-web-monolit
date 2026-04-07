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

/**
 * Matches the EmployeeResponse schema from the FastAPI backend.
 */
export interface Employee {
    id: number;
    user?: UserResponse;
    location_id: number;
    color: string;
    is_active: boolean;
    notes?: string | null;
    history_streak: number;
    settings?: EmployeeSettings;
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

export interface WeeklyConstraint {
    id: number;
    employee_id: number;
    shift_id: number;
    date: string; // "YYYY-MM-DD"
    constraint_type: ConstraintType
}

export interface WeeklyConstraintCreate {
    employee_id: number;
    shift_id: number;
    date: string;
    constraint_type: ConstraintType
}

export interface Assignment {
    id?: number;          // optional for new shift created in the UI (there is no ID until we send to DB)
    location_id: number;
    employee_id: number;
    shift_id: number;
    date: string;         // comes from server as "YYYY-MM-DD"
}

// for Grid:
export interface Employee {
    id: number;
    name: string;
    location_id: number;
    color: string;
    is_active: boolean;
    history_streak: number;
    settings?: EmployeeSettings;
    is_manager?: boolean; // Flag to determine if the employee has manager privileges

    // External Integrations
    yalam_id?: string | null;
    mishmarot_id?: string | null;
    shiftorg_id?: string | null;
}

export interface ShiftDefinition {
    id: number;
    name: string;
    start_time: string;
    end_time: string;
    location_id: number;
}

export interface ShiftDemand {
    id?: number;
    shift_definition_id: number;
    day_of_week: number; // 0 = Sunday, 6 = Saturday
    required_employees: number;
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
}