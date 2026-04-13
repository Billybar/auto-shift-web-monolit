// src/api/assignments.ts
import { apiClient } from './client'; // Assuming you have an Axios client setup
import type { Assignment } from '../types';

// Fetch schedule for a specific week
export const getAssignments = async (locationId: number, startDate: string, endDate: string): Promise<Assignment[]> => {
    const response = await apiClient.get('/api/assignments/', {
        params: { location_id: locationId, start_date: startDate, end_date: endDate }
    });
    return response.data;
};

// Trigger the OR-Tools engine to generate a new schedule
export const generateAutoSchedule = async (locationId: number, startDate: string): Promise<any> => {
    // Note: start_date is passed as a query parameter as expected by the backend
    const response = await apiClient.post(`/api/assignments/auto-generate/${locationId}`, null, {
        params: { start_date: startDate }
    });
    return response.data;
};

// Smart Sync - publish the board
export const syncAssignments = async (locationId: number, startDate: string, endDate: string, assignments: any[]) => {
    const response = await apiClient.post('/api/assignments/', assignments, {
        params: { location_id: locationId, start_date: startDate, end_date: endDate }
    });
    return response.data;
};

// Add this new function to handle the publishing of the schedule to the DB
export const saveAssignments = async (
    locationId: number,
    startDate: string,
    endDate: string,
    assignments: Assignment[]
) => {
    // Map to the AssignmentCreate schema expected by the backend
    const payload = assignments.map(a => ({
        employee_id: a.employee_id,
        shift_id: a.shift_id,
        date: a.date
    }));

    // Send a POST request with query parameters and the payload body
    const response = await apiClient.post('/api/assignments/', payload, {
        params: {
            location_id: locationId,
            start_date: startDate,
            end_date: endDate
        }
    });
    
    return response.data;
};