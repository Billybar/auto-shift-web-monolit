import { apiClient } from './client';
import type { ConstraintGroup } from '../src/types';

// The constraints-board rows of a location (groups of shifts marked together), in work-day order
export const getConstraintGroups = async (locationId: number): Promise<ConstraintGroup[]> => {
    const response = await apiClient.get('/api/constraint-groups/', {
        params: { location_id: locationId }
    });
    return response.data;
};
