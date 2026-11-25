// src/features/employees/hooks/useDeleteEmployee.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteEmployee } from '@/api/employees';
import { employeesKey } from '@/api/queries';
import { notify } from '@/lib/notify';

/**
 * Deletes an employee (the backend cascades to their user, settings, assignments, constraints and
 * notes) and refreshes the employee lists. The caller confirms first.
 */
export function useDeleteEmployee() {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: deleteEmployee,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: employeesKey }),
    });

    const remove = async (employeeId: number) => {
        try {
            await mutation.mutateAsync(employeeId);
            notify.success('העובד נמחק');
        } catch (err) {
            notify.error(err, 'מחיקת העובד נכשלה');
        }
    };

    // The row whose delete is in flight
    const deletingId = mutation.isPending ? mutation.variables : null;

    return { remove, deletingId };
}
