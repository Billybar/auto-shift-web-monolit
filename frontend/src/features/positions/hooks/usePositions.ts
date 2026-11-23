// src/features/positions/hooks/usePositions.ts
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { positionsQuery } from '../../../api/queries';
import { loadStatus } from '../../../api/query';
import type { Position } from '../../../types';

const NO_POSITIONS: Position[] = [];

/**
 * A location's roles, archived ones included (they label past assignments).
 * `activePositions` is what pickers and new demand offer.
 */
export function usePositions(locationId: number | null) {
    const query = useQuery(positionsQuery(locationId));
    const positions = query.data ?? NO_POSITIONS;
    const { refetch } = query;

    const reload = useCallback(async () => { await refetch(); }, [refetch]);

    const activePositions = useMemo(() => positions.filter(p => p.is_active), [positions]);
    const positionsById = useMemo(() => {
        const map: Record<number, Position> = {};
        positions.forEach(p => { map[p.id] = p; });
        return map;
    }, [positions]);

    return { positions, activePositions, positionsById, ...loadStatus(query), reload };
}
