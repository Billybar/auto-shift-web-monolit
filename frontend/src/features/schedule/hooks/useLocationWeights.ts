// src/features/schedule/hooks/useLocationWeights.ts
import { useState } from 'react';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getLocationWeights, updateLocationWeights } from '@/api/locations';
import { logError, toAppError } from '@/api/errors';
import { notify } from '@/lib/notify';
import type { LocationWeights } from '@/types';

const weightsQuery = (locationId: number | null, enabled: boolean) => queryOptions({
    queryKey: ['locationWeights', locationId],
    queryFn: () => getLocationWeights(locationId!),
    enabled: !!locationId && enabled,
});

/**
 * The solver's penalty weights of a location, edited in a modal. The modal edits a copy, so
 * Cancel drops the edits; `editing` is that copy, null while the modal is closed.
 * Staff only (`enabled`).
 */
export function useLocationWeights(locationId: number | null, enabled: boolean) {
    const queryClient = useQueryClient();
    const query = useQuery(weightsQuery(locationId, enabled));
    // The form never shows or saves values that aren't the real ones, so it opens only once loaded
    const weights = query.data ?? null;

    const [editing, setEditing] = useState<LocationWeights | null>(null);
    // Why the last save failed; shown in the modal, which stays open for a retry
    const [saveError, setSaveError] = useState<string | null>(null);

    const open = () => {
        if (!weights) return;
        setSaveError(null);
        setEditing(weights);
    };

    const saveMutation = useMutation({
        mutationFn: (v: { locationId: number; weights: LocationWeights }) => updateLocationWeights(v.locationId, v.weights),
        onSuccess: (updated, v) => {
            queryClient.setQueryData(weightsQuery(v.locationId, true).queryKey, updated);
        },
    });

    const close = () => {
        if (!saveMutation.isPending) setEditing(null);
    };

    const save = async () => {
        if (!locationId || !editing) return;
        try {
            setSaveError(null);
            await saveMutation.mutateAsync({ locationId, weights: editing });
            setEditing(null);
            notify.success('משקלי השיבוץ נשמרו');
        } catch (error) {
            logError('Failed to update weights:', error);
            setSaveError(toAppError(error).message);
        }
    };

    return {
        weights,
        editing,
        setEditing,
        open,
        close,
        save,
        isSaving: saveMutation.isPending,
        saveError,
    };
}
