// src/features/positions/hooks/usePositions.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPositions } from '../../../api/positions';
import { logError, toAppError } from '../../../api/errors';
import type { AppError } from '../../../api/errors';
import type { Position } from '../../../types';

/**
 * A location's roles, archived ones included (they label past assignments).
 * `activePositions` is what pickers and new demand offer.
 */
export function usePositions(locationId: number | null) {
    const [positions, setPositions] = useState<Position[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadError, setLoadError] = useState<AppError | null>(null);

    const reload = useCallback(async () => {
        if (!locationId) return;
        try {
            setIsLoading(true);
            setLoadError(null);
            setPositions(await getPositions(locationId, true));
        } catch (error) {
            logError('Failed to fetch positions:', error);
            setPositions([]);
            setLoadError(toAppError(error));
        } finally {
            setIsLoading(false);
        }
    }, [locationId]);

    useEffect(() => {
        reload();
    }, [reload]);

    const activePositions = useMemo(() => positions.filter(p => p.is_active), [positions]);
    const positionsById = useMemo(() => {
        const map: Record<number, Position> = {};
        positions.forEach(p => { map[p.id] = p; });
        return map;
    }, [positions]);

    return { positions, activePositions, positionsById, isLoading, loadError, reload, setPositions };
}
