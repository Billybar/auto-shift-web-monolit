// frontend/src/api/shiftDefinitions.ts
import { apiClient } from './client';
import type { ShiftDefinition, ShiftDemand, ShiftDayDemand } from '../types';

export const getShiftDefinitions = async (locationId: number): Promise<ShiftDefinition[]> => {
    const response = await apiClient.get('/api/shift-definitions/', {
        params: { location_id: locationId }
    });
    return response.data;
};


export const getShiftDemands = async (shiftId: number): Promise<ShiftDemand[]> => {
    const response = await apiClient.get(`/api/shift-definitions/${shiftId}/demands`);
    return response.data;
};


export const updateShiftDemands = async (shiftId: number, demands: { day_of_week: number, required_employees: number }[]): Promise<any> => {
    const response = await apiClient.put(`/api/shift-definitions/${shiftId}/demands`, { demands });
    return response.data;
};

// Fetch weekly demand map (templates + overrides)
export const getWeeklyDemand = async (locationId: number, startDate: string): Promise<ShiftDayDemand[]> => {
    const response = await apiClient.get('/api/shift-definitions/weekly-demand', {
        params: { location_id: locationId, start_date: startDate }
    });
    return response.data;
};

// Upsert/Reset a specific date's demand override
export const setShiftDemandOverride = async (shiftId: number, date: string, requiredEmployees: number): Promise<ShiftDayDemand> => {
    const response = await apiClient.put(`/api/shift-definitions/${shiftId}/demand-overrides/${date}`, {
        required_employees: requiredEmployees
    });
    return response.data;
};