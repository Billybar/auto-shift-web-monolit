// src/features/schedule/components/ReadOnlyChip.tsx
import type { Assignment, Employee, ShiftDefinition } from '../../../types';
import { toCssColor } from '../../../lib/color';

// A chip of the read-only previous-day column: not draggable, no remove button, hours as text
export default function ReadOnlyChip({
    assignment,
    employee,
    label,
    shift
}: {
    assignment: Assignment,
    employee: Employee | undefined,
    // Compact name for the chip; the full name stays in the tooltip
    label?: string,
    shift: ShiftDefinition
}) {
    const name = employee?.user
        ? `${employee.user.first_name} ${employee.user.last_name}`.trim()
        : `Emp #${assignment.employee_id}`;
    const displayName = label || name;
    const start = assignment.start_time || shift.start_time;
    const end = assignment.end_time || shift.end_time;
    const isStartChanged = !!assignment.start_time && assignment.start_time !== shift.start_time;
    const isEndChanged = !!assignment.end_time && assignment.end_time !== shift.end_time;

    return (
        <div
            className="w-[90%] max-w-[5.5rem] h-[3.5rem] mx-auto rounded border border-slate-300 flex flex-col overflow-hidden bg-white opacity-50 cursor-default"
            title={`${name}\n${start} - ${end}`}
        >
            <div
                className="w-full flex-1 flex items-center justify-center border-b border-slate-200"
                style={{ backgroundColor: toCssColor(employee?.color), color: '#1e293b' }}
            >
                <span className="text-xs font-semibold truncate px-1 w-full text-center">{displayName}</span>
            </div>
            <div className="h-5 flex-none flex items-center justify-center gap-1 bg-stone-200 text-stone-400 w-full" dir="ltr">
                <span className={`text-xs leading-none px-1 py-0.5 ${isStartChanged ? 'bg-blue-500 text-white rounded' : ''}`}>{start}</span>
                <span className="text-xs leading-none text-slate-400">-</span>
                <span className={`text-xs leading-none px-1 py-0.5 ${isEndChanged ? 'bg-blue-500 text-white rounded' : ''}`}>{end}</span>
            </div>
        </div>
    );
}
