// src/features/schedule/hooks/useSchedulePublication.ts
import { useState, useEffect, useCallback } from 'react';
import { getSchedulePublication, setSchedulePublication } from '../../../api/assignments';
import type { SchedulePublication } from '../../../types';
import { toast } from 'sonner';

interface UseSchedulePublicationReturn {
    isPublished: boolean;
    publishedAt: string | null;
    isLoading: boolean;
    isUpdating: boolean;
    setPublished: (publish: boolean) => Promise<boolean>;
}

export function useSchedulePublication(
    locationId: number | null,
    weekStartDate: string
): UseSchedulePublicationReturn {
    const [publicationState, setPublicationState] = useState<SchedulePublication | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isUpdating, setIsUpdating] = useState<boolean>(false);

    const fetchPublication = useCallback(async () => {
        if (!locationId) return;
        
        try {
            setIsLoading(true);
            const data = await getSchedulePublication(locationId, weekStartDate);
            setPublicationState(data);
        } catch (error) {
            console.error("Failed to fetch publication status:", error);
            // Default to draft on error to be safe
            setPublicationState({
                location_id: locationId,
                week_start_date: weekStartDate,
                is_published: false
            });
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
                toast.success('הסידור פורסם לעובדים בהצלחה');
            } else {
                toast.info('הסידור הוחזר למצב טיוטה');
            }
            return true;
        } catch (error) {
            console.error("Failed to update publication status:", error);
            toast.error('אירעה שגיאה בעדכון הסטטוס');
            return false;
        } finally {
            setIsUpdating(false);
        }
    };

    return {
        isPublished: publicationState?.is_published ?? false,
        publishedAt: publicationState?.published_at ?? null,
        isLoading,
        isUpdating,
        setPublished: handleSetPublished
    };
}