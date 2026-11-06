// src/features/constraints/components/EmployeeConstraintsModal.tsx
import type { Employee } from '../../../types';
import WeeklyConstraintsBoard from '../WeeklyConstraintsBoard';

interface EmployeeConstraintsModalProps {
    employee: Employee;
    isManager: boolean;
    // Locks the board to this week (a Sunday, YYYY-MM-DD); without it the board shows a week picker
    weekStart?: string;
    onClose: () => void;
    // Called after a save (the week or the defaults), so the parent can refresh what it shows
    onSaved?: () => void;
}

/**
 * Popup with an employee's constraints board. Clicking the backdrop doesn't close it,
 * so a misclick can't drop unsaved marks.
 */
export default function EmployeeConstraintsModal({
    employee,
    isManager,
    weekStart,
    onClose,
    onSaved
}: EmployeeConstraintsModalProps) {
    const employeeName = `${employee.user?.first_name ?? ''} ${employee.user?.last_name ?? ''}`.trim();

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 transition-opacity">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] p-1 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto p-5">
                    <WeeklyConstraintsBoard
                        employeeId={employee.id}
                        employeeName={employeeName}
                        isManager={isManager}
                        weekStart={weekStart}
                        onCancel={onClose}
                        onSaveSuccess={() => { onSaved?.(); onClose(); }}
                        onDefaultsSaveSuccess={onSaved}
                    />
                </div>
            </div>
        </div>
    );
}
