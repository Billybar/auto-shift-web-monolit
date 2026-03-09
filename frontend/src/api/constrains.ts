// src/api/constraints.ts
import { apiClient } from './client';
import type { WeeklyConstraint, WeeklyConstraintCreate } from '../types';

export const getEmployeeConstraints = async (
    employeeId: number, 
    startDate: string, 
    endDate: string
): Promise<WeeklyConstraint[]> => {
    const response = await apiClient.get<WeeklyConstraint[]>('/constraints/', {
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
) => {
    // השליחה מתבצעת כפי שהגדרת בשרת: פרמטרים ב-Query, והרשימה ב-Body
    const response = await apiClient.post('/constraints/sync', constraints, {
        params: { 
            employee_id: employeeId, 
            start_date: startDate, 
            end_date: endDate 
        }
    });
    return response.data;
};