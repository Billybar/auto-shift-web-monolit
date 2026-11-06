// frontend/src/api/constraints.ts
import { apiClient } from './client';
import type {
    ConstraintSubmissionStatus,
    DefaultConstraint,
    DefaultConstraintsResponse,
    ImportConstraintsResult,
    SyncConstraintsPayload,
    SyncConstraintsResponse,
    WeeklyDataResponse,
} from '../types';

// --- Manual Constraints ---
export const getEmployeeConstraints = async (
    employeeId: number, 
    startDate: string, 
    endDate: string
): Promise<WeeklyDataResponse> => {
    const response = await apiClient.get<WeeklyDataResponse>('/api/constraints/', {
        params: { 
            employee_id: employeeId, 
            start_date: startDate, 
            end_date: endDate 
        }
    });
    return response.data;
};

export const syncEmployeeConstraints = async (
    employeeId: number, 
    startDate: string, 
    endDate: string, 
    payload: SyncConstraintsPayload
): Promise<SyncConstraintsResponse> => {
    const response = await apiClient.post<SyncConstraintsResponse>('/api/constraints/sync', payload, {
        params: { 
            employee_id: employeeId, 
            start_date: startDate, 
            end_date: endDate 
        }
    });
    return response.data;
};

// --- Default constraints (the employee's default week) ---
export const getDefaultConstraints = async (employeeId: number): Promise<DefaultConstraintsResponse> => {
    const response = await apiClient.get<DefaultConstraintsResponse>('/api/constraints/defaults', {
        params: { employee_id: employeeId }
    });
    return response.data;
};

/** Replaces the employee's whole default week. */
export const saveDefaultConstraints = async (
    employeeId: number,
    constraints: DefaultConstraint[]
): Promise<DefaultConstraintsResponse> => {
    const response = await apiClient.put<DefaultConstraintsResponse>(
        '/api/constraints/defaults',
        { constraints },
        { params: { employee_id: employeeId } }
    );
    return response.data;
};

/** The location's employees who haven't submitted the week of weekStart (they show their defaults). */
export const getConstraintSubmissionStatus = async (
    locationId: number,
    weekStart: string
): Promise<ConstraintSubmissionStatus> => {
    const response = await apiClient.get<ConstraintSubmissionStatus>('/api/constraints/submission-status', {
        params: { location_id: locationId, week_start: weekStart }
    });
    return response.data;
};

// --- HTML File Import ---
export const importConstraintsFromHtml = async (
    file: File,
    source: string,
    startOfWeek: string,
    locationId: number
): Promise<ImportConstraintsResult> => {
    // Construct FormData for multipart/form-data upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source', source);
    formData.append('start_of_week', startOfWeek);
    formData.append('location_id', locationId.toString());

    // Axios will automatically set the correct Content-Type with the boundary string
    const response = await apiClient.post<ImportConstraintsResult>('/api/constraints/import-html', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        },
        // Large exports take a while to upload and parse
        timeout: 120_000
    });
    
    return response.data;
};