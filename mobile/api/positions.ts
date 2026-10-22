// mobile/api/positions.ts
import { apiClient } from './client';
import type { Position } from '../src/types';

// A location's roles in display order; archived ones label past assignments
export const getPositions = async (locationId: number, includeArchived = true): Promise<Position[]> => {
    const response = await apiClient.get('/api/positions/', {
        params: { location_id: locationId, include_archived: includeArchived }
    });
    return response.data;
};
