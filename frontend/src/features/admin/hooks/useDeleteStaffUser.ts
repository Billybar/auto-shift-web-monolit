// src/features/admin/hooks/useDeleteStaffUser.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteStaffUser } from '@/api/admin';
import { staffUsersQuery } from '@/api/queries';
import { notify } from '@/lib/notify';

/**
 * Deletes a staff login and refreshes the staff list. The caller confirms first.
 */
export function useDeleteStaffUser() {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: deleteStaffUser,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: staffUsersQuery().queryKey }),
    });

    const remove = async (userId: number) => {
        try {
            await mutation.mutateAsync(userId);
            notify.success('המשתמש נמחק');
        } catch (err) {
            notify.error(err, 'מחיקת המשתמש נכשלה');
        }
    };

    // The row whose delete is in flight
    const deletingId = mutation.isPending ? mutation.variables : null;

    return { remove, deletingId };
}
