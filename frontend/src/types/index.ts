// src/types/index.ts

/**
 * Matches the EmployeeResponse schema from the FastAPI backend.
 */
export interface Employee {
    id: number;
    name: string;
    location_id: number;
    color: string;
    is_active: boolean;
    history_streak: number;
    settings?: EmployeeSettings;
}

/**
 * Matches the EmployeeCreate schema from the FastAPI backend.
 * Used when sending a POST request to create a new employee.
 */
export interface EmployeeCreate {
    name: string;
    location_id: number;
    color: string;
    is_active: boolean;
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
export interface WeeklyConstraint {
    id: number;
    employee_id: number;
    shift_id: number;
    date: string; // "YYYY-MM-DD"
    constraint_type: string; // "CANNOT_WORK", "MUST_WORK"
}

export interface WeeklyConstraintCreate {
    employee_id: number;
    shift_id: number;
    date: string;
    constraint_type: string;
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
    first_name: string;
    last_name: string;
    // ... any other relevant fields your backend sends
}

export interface ShiftDefinition {
    id: number;
    name: string;         // e.g., "Morning", "Evening"
    start_time: string;
    end_time: string;
    // ...
}