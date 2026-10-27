// src/features/location-settings/hooks/useConstraintGroups.ts
import { useCallback, useEffect, useState } from 'react';
import { getConstraintGroups } from '../../../api/constraintGroups';
import { getShiftDefinitions } from '../../../api/shiftDefinitions';
import { logError, toAppError } from '../../../api/errors';
import type { AppError } from '../../../api/errors';
import type { ConstraintGroup } from '../../../types';
import { buildBoardRows } from '../../constraints/hooks/boardRows';
import type { BoardRow } from '../../constraints/hooks/boardRows';

export interface ConstraintGroupRow extends BoardRow {
    group: ConstraintGroup;
}

/**
 * The rows of the location's constraints board, each with its group and its shifts.
 */
export function useConstraintGroups(locationId: number | null) {
    const [rows, setRows] = useState<ConstraintGroupRow[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadError, setLoadError] = useState<AppError | null>(null);

    const reload = useCallback(async () => {
        if (!locationId) return;
        try {
            setIsLoading(true);
            setLoadError(null);
            const [shifts, groups] = await Promise.all([
                getShiftDefinitions(locationId),
                getConstraintGroups(locationId),
            ]);
            const groupsById = new Map(groups.map(g => [g.id, g]));
            setRows(buildBoardRows(shifts, groups).map(row => ({ ...row, group: groupsById.get(row.groupId)! })));
        } catch (error) {
            logError('Failed to fetch constraint groups:', error);
            setRows([]);
            setLoadError(toAppError(error));
        } finally {
            setIsLoading(false);
        }
    }, [locationId]);

    useEffect(() => {
        reload();
    }, [reload]);

    return { rows, isLoading, loadError, reload };
}
