import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { constraintGroupsQuery, shiftDefinitionsQuery } from '@/api/queries';
import { loadStatus } from '@/api/query';
import type { ShiftDefinition } from '@/types';
import { buildBoardRows } from './boardRows';
import type { BoardRow } from './boardRows';

const NO_SHIFTS: ShiftDefinition[] = [];
const NO_ROWS: BoardRow[] = [];

/** The location's shifts, and the constraints-board rows (groups of shifts) they are marked through. */
export const useShiftDefinitions = (locationId: number | null) => {
    const shiftsQuery = useQuery(shiftDefinitionsQuery(locationId));
    const groupsQuery = useQuery(constraintGroupsQuery(locationId));
    const shifts = shiftsQuery.data ?? NO_SHIFTS;
    const groups = groupsQuery.data;

    const rows = useMemo(
        () => (shiftsQuery.data && groups ? buildBoardRows(shiftsQuery.data, groups) : NO_ROWS),
        [shiftsQuery.data, groups]
    );
    const { isLoading, loadError } = loadStatus(shiftsQuery, groupsQuery);

    return {
        shifts,
        rows,
        isLoadingShifts: isLoading,
        shiftsError: loadError ? 'שגיאה בטעינת סוגי המשמרות. אנא נסה שוב.' : null,
    };
};
