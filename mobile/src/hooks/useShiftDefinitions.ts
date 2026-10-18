import { useQuery } from '@tanstack/react-query';
import { getShiftDefinitions } from '../../api/shiftDefinitions';
import { toAppError } from '../../api/errors';

// Same query key as the schedule screen, so both tabs share one cached copy per location
export const useShiftDefinitions = (locationId: number | undefined) => {
    const { data = [], isLoading, isFetching, error, refetch } = useQuery({
        queryKey: ['shiftDefinitions', locationId],
        queryFn: () => getShiftDefinitions(locationId as number),
        // Skip fetching if no location is selected
        enabled: !!locationId,
    });

    return {
        shifts: data,
        // A retry after a failure counts as loading, so the screen shows a spinner instead of the old error
        isLoadingShifts: isLoading || (!!error && isFetching),
        shiftsError: error ? toAppError(error) : null,
        reloadShifts: refetch,
    };
};
