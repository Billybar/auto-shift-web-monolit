import { apiClient } from './client';
import type { ShiftDefinition } from '../src/types';

// Fetch shift definitions for a specific location or all shifts
export const getShiftDefinitions = async (locationId: number): Promise<ShiftDefinition[]> => {
    const response = await apiClient.get('/api/shift-definitions/', {
        params: { location_id: locationId }
    });
    return response.data;
};
