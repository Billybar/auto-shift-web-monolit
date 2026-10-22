// src/api/positions.ts
import { apiClient } from './client';
import type { Position, PositionCreate, PositionUpdate } from '../types';

/**
 * A location's roles in display order. Archived roles are left out unless asked for
 * (they are still needed to label past assignments).
 */
export const getPositions = async (locationId: number, includeArchived = false): Promise<Position[]> => {
    const response = await apiClient.get<Position[]>('/api/positions/', {
        params: { location_id: locationId, include_archived: includeArchived }
    });
    return response.data;
};

export const createPosition = async (position: PositionCreate): Promise<Position> => {
    const response = await apiClient.post<Position>('/api/positions/', position);
    return response.data;
};

/** Partial update; `is_active: false` archives the role, `true` restores it. */
export const updatePosition = async (positionId: number, changes: PositionUpdate): Promise<Position> => {
    const response = await apiClient.put<Position>(`/api/positions/${positionId}`, changes);
    return response.data;
};

/** Fails with 409 `position_in_use` when assignments use the role. */
export const deletePosition = async (positionId: number): Promise<void> => {
    await apiClient.delete(`/api/positions/${positionId}`);
};
