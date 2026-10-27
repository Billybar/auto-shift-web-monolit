import { apiClient } from './client';
import type { ShiftDefinition } from '../src/types';

// A location's shifts in work-day order: morning, evening, night (a start before 04:00 comes last)
export const getShiftDefinitions = async (locationId: number): Promise<ShiftDefinition[]> => {
    const response = await apiClient.get('/api/shift-definitions/', {
        params: { location_id: locationId }
    });
    return response.data;
};
