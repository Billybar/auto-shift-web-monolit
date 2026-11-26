// src/features/admin/hooks/useDeleteShift.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { invalidateLocationShifts } from '@/api/queries';
import { deleteShiftDefinition } from '@/api/shiftDefinitions';
import { notify } from '@/lib/notify';

/**
 * Deletes a shift of the location (its demand template goes with it) and refreshes what is built
 * from the location's shifts. The caller confirms first.
 */
export function useDeleteShift(locationId: number | null) {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: deleteShiftDefinition,
        onSuccess: () => invalidateLocationShifts(queryClient, locationId!),
    });

    /** Returns true when deleted. */
    const remove = async (shiftId: number): Promise<boolean> => {
        try {
            await mutation.mutateAsync(shiftId);
            notify.success('המשמרת נמחקה');
            return true;
        } catch (err) {
            notify.error(err, 'מחיקת המשמרת נכשלה');
            return false;
        }
    };

    // The row whose delete is in flight
    const deletingId = mutation.isPending ? mutation.variables : null;

    return { remove, deletingId };
}
