// src/features/location-settings/hooks/positionOrder.ts
import type { Position } from '@/types';

export interface SortOrderUpdate {
    positionId: number;
    sortOrder: number;
}

/**
 * Moves the role at `index` one place up (-1) or down (1) and renumbers the list 0, 1, 2, …
 * Returns only the roles whose `sort_order` changes, or null when the move leaves the list.
 */
export const reorderUpdates = (positions: Position[], index: number, delta: -1 | 1): SortOrderUpdate[] | null => {
    const target = index + delta;
    if (index < 0 || index >= positions.length || target < 0 || target >= positions.length) return null;
    const reordered = [...positions];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    return reordered
        .map((position, sortOrder) => ({ position, sortOrder }))
        .filter(({ position, sortOrder }) => position.sort_order !== sortOrder)
        .map(({ position, sortOrder }) => ({ positionId: position.id, sortOrder }));
};
