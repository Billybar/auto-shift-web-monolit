// src/features/schedule/hooks/useConstraintSubmissions.ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { constraintSubmissionsQuery } from '@/api/queries';

const NONE: ReadonlySet<number> = new Set();

/**
 * The employees who haven't submitted constraints for the week, so their week shows their defaults.
 * A published week has none (publishing submits it for everyone), so nothing is fetched for it.
 * Only staff may read it (the endpoint needs scheduler rights), so an employee gets none.
 * The marker is auxiliary: a failed load is only logged and leaves the set empty.
 * A constraints save refreshes it (useWeeklyConstraints invalidates the query) while the current
 * markers stay on screen.
 */
export function useConstraintSubmissions(
    locationId: number | null,
    weekStartDate: string,
    isPublished: boolean,
    isStaff: boolean
): ReadonlySet<number> {
    const isRelevant = isStaff && !isPublished;
    const { data } = useQuery({
        ...constraintSubmissionsQuery(locationId, weekStartDate),
        enabled: !!locationId && isRelevant,
    });
    // Until this week's answer arrives there is no data, so no markers rather than the previous week's
    const pending = useMemo(() => (data ? new Set(data.pending_employee_ids) : NONE), [data]);
    return isRelevant ? pending : NONE;
}
