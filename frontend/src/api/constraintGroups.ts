// src/api/constraintGroups.ts
import { apiClient } from './client';
import type { ConstraintGroup, ConstraintGroupMergeResult } from '../types';

/** The constraints-board rows of a location, in the order of the work day. */
export const getConstraintGroups = async (locationId: number): Promise<ConstraintGroup[]> => {
    const response = await apiClient.get<ConstraintGroup[]>('/api/constraint-groups/', {
        params: { location_id: locationId }
    });
    return response.data;
};

/** An empty name clears it; the board then shows the shift names. */
export const renameConstraintGroup = async (groupId: number, name: string): Promise<ConstraintGroup> => {
    const response = await apiClient.put<ConstraintGroup>(`/api/constraint-groups/${groupId}`, { name });
    return response.data;
};

/** Moves the source row's shifts and submitted constraints into the target row. */
export const mergeConstraintGroups = async (
    targetGroupId: number,
    sourceGroupId: number
): Promise<ConstraintGroupMergeResult> => {
    const response = await apiClient.post<ConstraintGroupMergeResult>(
        `/api/constraint-groups/${targetGroupId}/merge`,
        { source_group_id: sourceGroupId }
    );
    return response.data;
};

/** Moves one shift out into a new row, which keeps a copy of the row's submitted constraints. */
export const splitConstraintGroup = async (groupId: number, shiftId: number): Promise<ConstraintGroup> => {
    const response = await apiClient.post<ConstraintGroup>(`/api/constraint-groups/${groupId}/split`, {
        shift_id: shiftId
    });
    return response.data;
};
