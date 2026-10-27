import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getConstraintGroups } from '../../api/constraintGroups';
import { toAppError } from '../../api/errors';
import { buildBoardRows } from '../lib/boardRows';
import { useShiftDefinitions } from './useShiftDefinitions';

// The rows of the constraints board: each one stands for one or more of the location's shifts
export const useBoardRows = (locationId: number | undefined) => {
    const { shifts, isLoadingShifts, shiftsError, reloadShifts } = useShiftDefinitions(locationId);
    const groupsQuery = useQuery({
        queryKey: ['constraintGroups', locationId],
        queryFn: () => getConstraintGroups(locationId as number),
        // Skip fetching if no location is selected
        enabled: !!locationId,
    });
    const groups = groupsQuery.data;

    const rows = useMemo(() => buildBoardRows(shifts, groups ?? []), [shifts, groups]);

    return {
        rows,
        // A retry after a failure counts as loading, so the screen shows a spinner instead of the old error
        isLoadingRows: isLoadingShifts || groupsQuery.isLoading || (!!groupsQuery.error && groupsQuery.isFetching),
        rowsError: shiftsError ?? (groupsQuery.error ? toAppError(groupsQuery.error) : null),
        reloadRows: () => {
            if (shiftsError) reloadShifts();
            if (groupsQuery.error) groupsQuery.refetch();
        },
    };
};
