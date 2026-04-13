// frontend/src/api/shiftDefinitions.ts
import { apiClient } from './client';
import type { ShiftDefinition, ShiftDemand } from '../types';

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