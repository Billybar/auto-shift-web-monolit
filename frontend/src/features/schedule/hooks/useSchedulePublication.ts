// src/features/schedule/hooks/useSchedulePublication.ts
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { setSchedulePublication } from '@/api/assignments';
import type { AppError } from '@/api/errors';
import { constraintSubmissionsQuery, publicationQuery } from '@/api/queries';
import { loadStatus } from '@/api/query';
import { notify } from '@/lib/notify';

interface UseSchedulePublicationReturn {
    isPublished: boolean;
    publishedAt: string | null;
    isLoading: boolean;
    // Set when the status couldn't be loaded; the page shows an error state instead of guessing "draft"
    loadError: AppError | null;
    reload: () => Promise<void>;
    isUpdating: boolean;
    setPublished: (publish: boolean) => Promise<boolean>;
}

export function useSchedulePublication(
    locationId: number | null,
    weekStartDate: string
): UseSchedulePublicationReturn {
    const queryClient = useQueryClient();
    // A failed load leaves no data: a published week shown as a draft would mislead the save/publish flow
    const query = useQuery(publicationQuery(locationId, weekStartDate));

    const mutation = useMutation({
        mutationFn: (week: { locationId: number; weekStartDate: string; publish: boolean }) =>
            setSchedulePublication(week.locationId, week.weekStartDate, week.publish),
        onSuccess: (updated, week) => {
            queryClient.setQueryData(publicationQuery(week.locationId, week.weekStartDate).queryKey, updated);
            // Publishing submits the week for everyone, so the "not submitted" markers are out of date
            // either way. Reset, not just refetched, so the old ones never show while it loads.
            void queryClient.resetQueries({ queryKey: constraintSubmissionsQuery(week.locationId, week.weekStartDate).queryKey });
        },
    });

    const handleSetPublished = async (publish: boolean): Promise<boolean> => {
        if (!locationId) return false;

        try {
            await mutation.mutateAsync({ locationId, weekStartDate, publish });
            if (publish) {
                notify.success('הסידור פורסם לעובדים');
            } else {
                notify.info('הסידור הוחזר למצב טיוטה', 'המשמרות מוסתרות מהעובדים');
            }
            return true;
        } catch (error) {
            notify.error(error, publish ? 'פרסום הסידור נכשל' : 'ביטול הפרסום נכשל');
            return false;
        }
    };

    const { refetch } = query;
    const reload = useCallback(async () => { await refetch(); }, [refetch]);

    return {
        isPublished: query.data?.is_published ?? false,
        publishedAt: query.data?.published_at ?? null,
        ...loadStatus(query),
        reload,
        isUpdating: mutation.isPending,
        setPublished: handleSetPublished
    };
}
