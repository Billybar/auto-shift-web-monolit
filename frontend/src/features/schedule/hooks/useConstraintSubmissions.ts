// src/features/schedule/hooks/useConstraintSubmissions.ts
import { useEffect, useState } from 'react';
import { getConstraintSubmissionStatus } from '../../../api/constraints';
import { logError } from '../../../api/errors';

const NONE: ReadonlySet<number> = new Set();

/**
 * The employees who haven't submitted constraints for the week, so their week shows their defaults.
 * A published week has none (publishing submits it for everyone), so nothing is fetched for it.
 * The marker is auxiliary: a failed load is only logged and leaves the set empty.
 */
export function useConstraintSubmissions(
    locationId: number | null,
    weekStartDate: string,
    isPublished: boolean
): ReadonlySet<number> {
    const [result, setResult] = useState<{ key: string; ids: ReadonlySet<number> } | null>(null);
    // Unpublishing refetches too: the publish submitted the week for everyone
    const key = `${locationId}:${weekStartDate}:${isPublished}`;

    useEffect(() => {
        if (!locationId || isPublished) return;
        let ignore = false;
        getConstraintSubmissionStatus(locationId, weekStartDate)
            .then(data => {
                if (!ignore) setResult({ key, ids: new Set(data.pending_employee_ids) });
            })
            .catch(err => {
                if (ignore) return;
                logError('Failed to fetch constraint submission status:', err);
                setResult({ key, ids: NONE });
            });
        // A response for a week the user already left is dropped
        return () => { ignore = true; };
    }, [locationId, weekStartDate, isPublished, key]);

    // Until this week's answer arrives, show no markers rather than the previous week's
    if (isPublished || result?.key !== key) return NONE;
    return result.ids;
}
