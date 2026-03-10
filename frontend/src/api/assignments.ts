// src/api/assignments.ts
import { apiClient } from './client'; // Assuming you have an Axios client setup
import type { Assignment } from '../types';

// Fetch schedule for a specific week
export const getAssignments = async (locationId: number, startDate: string, endDate: string): Promise<Assignment[]> => {
    const response = await apiClient.get('/assignments/', {
        params: { location_id: locationId, start_date: startDate, end_date: endDate }
    });
    return response.data;
};

// Trigger the OR-Tools solver
export const generateAutoSchedule = async (locationId: number): Promise<any> => {
    const response = await apiClient.post(`/assignments/auto-generate/${locationId}`);
    return response.data;
};

// Smart Sync - publish the board
export const syncAssignments = async (locationId: number, startDate: string, endDate: string, assignments: any[]) => {
    const response = await apiClient.post('/assignments/', assignments, {
        params: { location_id: locationId, start_date: startDate, end_date: endDate }
    });
    return response.data;
};