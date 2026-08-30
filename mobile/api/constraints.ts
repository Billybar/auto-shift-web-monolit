// mobile/api/constraints.ts
import { apiClient } from './client';
import type { WeeklyConstraint, WeeklyConstraintCreate } from '../src/types'; // Adjust path if needed

export const getEmployeeConstraints = async (
    employeeId: number, 
    startDate: string, 
    endDate: string
): Promise<WeeklyConstraint[]> => {
    const response = await apiClient.get<WeeklyConstraint[]>('/api/constraints/', {
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
    constraints: WeeklyConstraintCreate[]
) =>{
    const response = await apiClient.post('/api/constraints/sync', constraints, {
        params: { 
            employee_id: employeeId, 
            start_date: startDate, 
            end_date: endDate 
        }
    });
    return response.data;
};