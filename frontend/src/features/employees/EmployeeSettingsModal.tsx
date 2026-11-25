// src/features/employees/EmployeeSettingsModal.tsx
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { updateEmployeeSettings } from '@/api/employees';
import { employeesKey } from '@/api/queries';
import { logError, toAppError } from '@/api/errors';
import { notify } from '@/lib/notify';
import InlineAlert from '@/components/ui/InlineAlert';
import Button from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import type { Employee } from '@/types';
import EmployeeSettingsFields from './EmployeeSettingsFields';
import { useEmployeeSettingsForm, SETTINGS_TITLE } from './hooks/useEmployeeSettingsForm';

interface EmployeeSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
}

/**
 * Compact modal for editing only an employee's shift limits (used on the schedule page).
 * Saves through the settings endpoint alone, so name, email and location are never re-sent.
 */
export default function EmployeeSettingsModal({ isOpen, onClose, employee }: EmployeeSettingsModalProps) {
    const queryClient = useQueryClient();
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    // Why the last save failed (shown inside the modal, which stays open for a retry)
    const [saveError, setSaveError] = useState<string | null>(null);
    const { values, setField, validationError } = useEmployeeSettingsForm(employee, isOpen);

    // Start clean each time the modal opens or switches employee
    useEffect(() => {
        setSaveError(null);
    }, [employee, isOpen]);

    if (!isOpen || !employee) return null;

    const employeeName = `${employee.user?.first_name ?? ''} ${employee.user?.last_name ?? ''}`.trim() || 'Unknown';

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (validationError) return;

        try {
            setIsSubmitting(true);
            setSaveError(null);
            await updateEmployeeSettings(employee.id, values);
            notify.success('הגדרות המשמרות נשמרו');
            // The employee lists carry the settings
            void queryClient.invalidateQueries({ queryKey: employeesKey });
            onClose();
        } catch (err) {
            logError("Failed to update employee settings:", err);
            setSaveError(toAppError(err).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        // Closing is blocked while a save is in flight
        <Dialog open onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
            <DialogContent size="sm" aria-describedby={undefined}>
                {/* Employee name and the section title share one line (name on the right, title on the left) */}
                <DialogHeader className="flex-row items-baseline justify-between gap-3">
                    <DialogTitle className="truncate min-w-0">{employeeName}</DialogTitle>
                    <span className="text-xs font-semibold text-gray-900 shrink-0">{SETTINGS_TITLE}</span>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <EmployeeSettingsFields values={values} onFieldChange={setField} error={validationError} showTitle={false} />

                    {saveError && <InlineAlert variant="error" title="שמירת הגדרות המשמרות נכשלה">{saveError}</InlineAlert>}

                    <DialogFooter>
                        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>ביטול</Button>
                        <Button type="submit" loading={isSubmitting} disabled={!!validationError}>
                            {isSubmitting ? 'שומר...' : 'שמור שינויים'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
