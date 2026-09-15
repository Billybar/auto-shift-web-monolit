// src/api/constraints.ts
import { apiClient } from './client';
import type { WeeklyConstraint, WeeklyConstraintCreate, WeeklyDataResponse, SyncConstraintsPayload } from '../types';

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


// --- HTML File Import ---
export const importConstraintsFromHtml = async (
    file: File,
    source: string,
    startOfWeek: string,
    locationId: number
) => {
    // Construct FormData for multipart/form-data upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source', source);
    formData.append('start_of_week', startOfWeek);
    formData.append('location_id', locationId.toString());

    // Axios will automatically set the correct Content-Type with the boundary string
    const response = await apiClient.post('/api/constraints/import-html', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
    
    return response.data;
};