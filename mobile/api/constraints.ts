// mobile/api/constraints.ts
import { apiClient } from './client';
import type { WeeklyConstraint, WeeklyConstraintCreate, WeeklyDataResponse, SyncConstraintsPayload } from '../src/types'; // Adjust path if needed

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
) =>{
    const response = await apiClient.post('/api/constraints/sync', payload, {
        params: { 
            employee_id: employeeId, 
            start_date: startDate, 
            end_date: endDate 
        }
    });
    return response.data;
};