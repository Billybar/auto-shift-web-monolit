// src/features/schedule/hooks/useSchedulePublication.ts
import { useState, useEffect, useCallback } from 'react';
import { getSchedulePublication, setSchedulePublication } from '../../../api/assignments';
import { logError, toAppError } from '../../../api/errors';
import type { AppError } from '../../../api/errors';
import type { SchedulePublication } from '../../../types';
import { notify } from '../../../lib/notify';

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
    const [publicationState, setPublicationState] = useState<SchedulePublication | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [loadError, setLoadError] = useState<AppError | null>(null);
    const [isUpdating, setIsUpdating] = useState<boolean>(false);

    const fetchPublication = useCallback(async () => {
        if (!locationId) return;

        try {
            setIsLoading(true);
            setLoadError(null);
            const data = await getSchedulePublication(locationId, weekStartDate);
            setPublicationState(data);
        } catch (error) {
            logError("Failed to fetch publication status:", error);
            // Don't assume "draft": a published week shown as a draft would mislead the save/publish flow
            setPublicationState(null);
            setLoadError(toAppError(error));
        } finally {
            setIsLoading(false);
        }
    }, [locationId, weekStartDate]);

    useEffect(() => {
        fetchPublication();
    }, [fetchPublication]);

    const handleSetPublished = async (publish: boolean): Promise<boolean> => {
        if (!locationId) return false;

        try {
            setIsUpdating(true);
            const updatedState = await setSchedulePublication(locationId, weekStartDate, publish);
            setPublicationState(updatedState);

            if (publish) {
                notify.success('הסידור פורסם לעובדים');
            } else {
                notify.info('הסידור הוחזר למצב טיוטה', 'המשמרות מוסתרות מהעובדים');
            }
            return true;
        } catch (error) {
            notify.error(error, publish ? 'פרסום הסידור נכשל' : 'ביטול הפרסום נכשל');
            return false;
        } finally {
            setIsUpdating(false);
        }
    };

    return {
        isPublished: publicationState?.is_published ?? false,
        publishedAt: publicationState?.published_at ?? null,
        isLoading,
        loadError,
        reload: fetchPublication,
        isUpdating,
        setPublished: handleSetPublished
    };
}
