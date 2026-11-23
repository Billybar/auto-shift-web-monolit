// src/features/constraints/components/EmployeeConstraintsModal.tsx
import type { Employee } from '../../../types';
import { Dialog, DialogContent, DialogTitle } from '../../../components/ui/Dialog';
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
 * Popup with an employee's constraints board. Neither the backdrop nor Esc closes it,
 * so a misclick can't drop unsaved marks; the board's own Cancel does.
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
        <Dialog open>
            <DialogContent
                size="5xl"
                closeOnBackdrop={false}
                onEscapeKeyDown={(e) => e.preventDefault()}
                aria-describedby={undefined}
                className="max-h-[85vh] p-1 overflow-hidden flex flex-col rounded-2xl"
            >
                {/* The board shows the name itself; the title is for screen readers */}
                <DialogTitle className="sr-only">{`האילוצים של ${employeeName}`}</DialogTitle>
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
            </DialogContent>
        </Dialog>
    );
}
