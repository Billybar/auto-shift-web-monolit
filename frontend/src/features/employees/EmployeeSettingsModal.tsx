// src/features/employees/EmployeeSettingsModal.tsx
import type { FormEvent } from 'react';
import InlineAlert from '@/components/ui/InlineAlert';
import Button from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import type { Employee } from '@/types';
import EmployeeSettingsFields from './EmployeeSettingsFields';
import { useEmployeeSettingsForm, SETTINGS_TITLE } from './hooks/useEmployeeSettingsForm';
import { useSaveEmployeeSettings } from './hooks/useSaveEmployeeSettings';

interface EmployeeSettingsModalProps {
    onClose: () => void;
    employee: Employee;
}

/**
 * Compact modal for editing only an employee's shift limits (used on the schedule page).
 * Mount it only while open, keyed by the employee: it starts from their saved settings.
 */
export default function EmployeeSettingsModal({ onClose, employee }: EmployeeSettingsModalProps) {
    const { values, setField, validationError } = useEmployeeSettingsForm(employee, true);
    // A failed save is shown inside the modal, which stays open for a retry
    const { save, error: saveError, isPending: isSubmitting } = useSaveEmployeeSettings();

    const employeeName = `${employee.user?.first_name ?? ''} ${employee.user?.last_name ?? ''}`.trim() || 'Unknown';

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (validationError) return;
        if (await save(employee.id, values)) onClose();
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
