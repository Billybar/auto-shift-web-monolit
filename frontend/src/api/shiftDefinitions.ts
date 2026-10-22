// frontend/src/api/shiftDefinitions.ts
import { apiClient } from './client';
import type { ShiftDefinition, ShiftDayDemand } from '../types';

export const getShiftDefinitions = async (locationId: number): Promise<ShiftDefinition[]> => {
    const response = await apiClient.get('/api/shift-definitions/', {
        params: { location_id: locationId }
    });
    return response.data;
};

// Fetch the week's demand: one cell per shift × active role × date (templates + overrides)
export const getWeeklyDemand = async (locationId: number, startDate: string): Promise<ShiftDayDemand[]> => {
    const response = await apiClient.get('/api/shift-definitions/weekly-demand', {
        params: { location_id: locationId, start_date: startDate }
    });
    return response.data;
};

// Upsert/Reset one role's demand on a specific date (the template's value resets it)
export const setShiftDemandOverride = async (
    shiftId: number,
    date: string,
    positionId: number,
    requiredEmployees: number
): Promise<ShiftDayDemand> => {
    const response = await apiClient.put(`/api/shift-definitions/${shiftId}/demand-overrides/${date}`, {
        position_id: positionId,
        required_employees: requiredEmployees
    });
    return response.data;
};
