// mobile/api/constraints.ts
import { apiClient } from './client';
import type {
    DefaultConstraint,
    DefaultConstraintsResponse,
    SyncConstraintsPayload,
    SyncConstraintsResponse,
    WeeklyDataResponse,
} from '../src/types';

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
