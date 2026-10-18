// src/features/employees/EmployeeSettingsModal.tsx
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { updateEmployeeSettings } from '../../api/employees';
import { logError, toAppError } from '../../api/errors';
import { notify } from '../../lib/notify';
import InlineAlert from '../../components/ui/InlineAlert';
import type { Employee } from '../../types';
import EmployeeSettingsFields from './EmployeeSettingsFields';
import { useEmployeeSettingsForm, SETTINGS_TITLE } from './hooks/useEmployeeSettingsForm';

interface EmployeeSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
    // Callback to trigger a data refresh in the parent component after a successful save
    onSuccess: () => void;
}

/**
 * Compact modal for editing only an employee's shift limits (used on the schedule page).
 * Saves through the settings endpoint alone, so name, email and location are never re-sent.
 */
export default function EmployeeSettingsModal({ isOpen, onClose, employee, onSuccess }: EmployeeSettingsModalProps) {
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
            onSuccess(); // Triggers the parent to fetch the updated data
            onClose();
        } catch (err) {
            logError("Failed to update employee settings:", err);
            setSaveError(toAppError(err).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        // Clicking the backdrop acts like Cancel. Checked on mousedown so a text selection that
        // starts inside an input and is released outside the panel does not close the modal.
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" dir="rtl"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
                {/* Employee name and the section title share one line (name on the right, title on the left) */}
                <div className="flex items-baseline justify-between gap-3 mb-4">
                    <h2 className="text-xl font-bold truncate min-w-0">{employeeName}</h2>
                    <span className="text-xs font-semibold text-gray-900 shrink-0">{SETTINGS_TITLE}</span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <EmployeeSettingsFields values={values} onFieldChange={setField} error={validationError} showTitle={false} />

                    {saveError && <InlineAlert variant="error" title="שמירת הגדרות המשמרות נכשלה">{saveError}</InlineAlert>}

                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition">ביטול</button>
                        <button type="submit" disabled={isSubmitting || !!validationError} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50">
                            {isSubmitting ? 'שומר...' : 'שמור שינויים'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
