// src/features/employees/hooks/useSaveEmployeeSettings.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateEmployeeSettings } from '@/api/employees';
import { logError, toAppError } from '@/api/errors';
import { employeesKey } from '@/api/queries';
import { notify } from '@/lib/notify';
import type { EmployeeSettingsUpdate } from '@/types';

interface SaveRequest {
    employeeId: number;
    settings: EmployeeSettingsUpdate;
}

/**
 * Saves an employee's shift limits alone (name, email and location are never re-sent), and
 * refreshes the employee lists, which carry the settings. `error` is the last failure, in Hebrew.
 */
export function useSaveEmployeeSettings() {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: ({ employeeId, settings }: SaveRequest) => updateEmployeeSettings(employeeId, settings),
        onSuccess: () => {
            notify.success('הגדרות המשמרות נשמרו');
            void queryClient.invalidateQueries({ queryKey: employeesKey });
        },
        onError: (error) => logError('Failed to update employee settings:', error),
    });

    /** Returns true when saved, so the modal can close. */
    const save = async (employeeId: number, settings: EmployeeSettingsUpdate): Promise<boolean> => {
        try {
            await mutation.mutateAsync({ employeeId, settings });
            return true;
        } catch {
            return false;
        }
    };

    return {
        save,
        error: mutation.error ? toAppError(mutation.error).message : null,
        isPending: mutation.isPending,
    };
}
