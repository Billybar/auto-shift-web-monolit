// src/features/location-settings/hooks/useConstraintGroups.ts
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { constraintGroupsQuery, shiftDefinitionsQuery } from '../../../api/queries';
import { loadStatus } from '../../../api/query';
import type { ConstraintGroup } from '../../../types';
import { buildBoardRows } from '../../constraints/hooks/boardRows';
import type { BoardRow } from '../../constraints/hooks/boardRows';

export interface ConstraintGroupRow extends BoardRow {
    group: ConstraintGroup;
}

const NO_ROWS: ConstraintGroupRow[] = [];

/**
 * The rows of the location's constraints board, each with its group and its shifts.
 */
export function useConstraintGroups(locationId: number | null) {
    const shiftsQuery = useQuery(shiftDefinitionsQuery(locationId));
    const groupsQuery = useQuery(constraintGroupsQuery(locationId));
    const shifts = shiftsQuery.data;
    const groups = groupsQuery.data;

    const rows = useMemo(() => {
        if (!shifts || !groups) return NO_ROWS;
        const groupsById = new Map(groups.map(g => [g.id, g]));
        return buildBoardRows(shifts, groups).map(row => ({ ...row, group: groupsById.get(row.groupId)! }));
    }, [shifts, groups]);

    const refetchShifts = shiftsQuery.refetch;
    const refetchGroups = groupsQuery.refetch;
    // Merging or splitting rows changes both lists
    const reload = useCallback(async () => {
        await Promise.all([refetchShifts(), refetchGroups()]);
    }, [refetchShifts, refetchGroups]);

    return { rows, ...loadStatus(shiftsQuery, groupsQuery), reload };
}
