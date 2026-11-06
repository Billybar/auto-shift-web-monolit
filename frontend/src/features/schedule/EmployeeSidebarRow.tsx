import { useState, useEffect } from 'react';
import { AlertTriangle, Check, Edit } from 'lucide-react';
import { HoverCard } from 'radix-ui';
import { getEmployeeConstraints } from '../../api/constraints';
import { logError } from '../../api/errors';
import { toCssColor } from '../../lib/color';
import type { Assignment, Employee, Position, ShiftDefinition, WeeklyConstraint } from '../../types';
import PositionBadge from '../positions/PositionBadge';
import type { DragPayload } from './ScheduleGrid';

interface EmployeeSidebarRowProps {
    emp: Employee;
    // Compact name shown on the chip; falls back to the full name
    label?: string;
    // Active roles of the location, in display order
    positions: Position[];
    // Role badges are shown only when the site has more than one role
    showPositions: boolean;
    assignments: Assignment[];
    onEdit: (employeeId: number) => void;
    // Opens the employee's constraints for the week (a click on the shift-count box)
    onEditConstraints: (employeeId: number) => void;
    weekDates: string[];
    shifts: ShiftDefinition[];
    // The employee hasn't submitted constraints for the week: it shows their defaults (empty or not)
    hasPendingConstraints: boolean;
}

const PENDING_CONSTRAINTS_LABEL = 'לא הוגשו אילוצים לשבוע זה';
const EDIT_CONSTRAINTS_LABEL = 'לחיצה לעריכת אילוצים';

export default function SidebarEmployeeRow({
    emp,
    label,
    positions,
    showPositions,
    assignments,
    onEdit,
    onEditConstraints,
    weekDates,
    shifts,
    hasPendingConstraints
}: EmployeeSidebarRowProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [constraints, setConstraints] = useState<WeeklyConstraint[]>([]);
    const [note, setNote] = useState<string | null>(null);
    const [hasFetched, setHasFetched] = useState(false);

    // Calculate how many shifts this employee has directly from the current un-saved state
    const shiftCount = assignments.filter(a => a.employee_id === emp.id).length;

    // The employee's active roles; without one, auto-assign leaves them out
    const heldPositions = positions.filter(p => emp.position_ids.includes(p.id));

    const fullName = emp.user ? `${emp.user.first_name || ''} ${emp.user.last_name || ''}`.trim() : 'Unknown';

    // Fetch constraints from DB only when hovered for the first time
    useEffect(() => {
        if (isHovered && !hasFetched && weekDates && weekDates.length > 0) {
            const startDate = weekDates[0];
            const endDate = weekDates[weekDates.length - 1];
            
            getEmployeeConstraints(emp.id, startDate, endDate)
                .then(data => {
                    setConstraints(data.constraints);
                    setNote(data.note || null);
                    setHasFetched(true);
                })
                .catch(err => logError("Failed to fetch constraints:", err));
        }
    }, [isHovered, hasFetched, emp.id, weekDates]);

    return (
        <div className="w-full">
        <div className="flex items-center gap-1 w-full relative">
            
            {/* 1. The Draggable Area */}
            <div 
                draggable 
                onDragStart={(e) => {
                    const payload: DragPayload = { type: 'FROM_SIDEBAR', employee_id: emp.id };
                    e.dataTransfer.setData('application/json', JSON.stringify(payload));
                }}
                className="h-8 flex-1 min-w-0 rounded border border-slate-200 flex items-center justify-center shadow-sm cursor-grab active:cursor-grabbing hover:opacity-80 transition"
                style={{ 
                    backgroundColor: toCssColor(emp.color),
                    color: '#1e293b' 
                }}
                title={`${fullName}\nלחץ וגרור לטבלה כדי לשבץ`}
            >
                <span className="text-xs font-semibold truncate px-2 drop-shadow-sm block w-full text-center">
                    {label || fullName}
                </span>
                {heldPositions.length === 0 && (
                    <span title="לעובד אין תפקיד פעיל, ולכן השיבוץ האוטומטי לא ישבץ אותו" className="me-1 shrink-0">
                        <AlertTriangle size={13} className="text-amber-600" />
                    </span>
                )}
            </div>

            {/* 2. Shift Count & Hover Grid: hover previews the week, a click opens the constraints editor.
                The card is controlled so the click can close it: it is portaled above the page and
                would otherwise stay over the editor until the mouse moves. */}
            <HoverCard.Root open={isHovered} openDelay={150} closeDelay={50} onOpenChange={setIsHovered}>
            <HoverCard.Trigger asChild>
            <button
                type="button"
                onClick={() => {
                    setIsHovered(false);
                    onEditConstraints(emp.id);
                }}
                className="relative h-8 w-8 flex items-center justify-center rounded border border-slate-200 bg-slate-50 shadow-sm shrink-0 cursor-pointer hover:bg-slate-100 transition"
                title={EDIT_CONSTRAINTS_LABEL}
                aria-label={`${EDIT_CONSTRAINTS_LABEL}: ${fullName}`}
            >
                <span className="text-sm font-bold text-slate-700">{shiftCount}</span>
                {/* Sky corner: no constraints submitted this week (amber corners mean a role mismatch on the grid) */}
                {hasPendingConstraints && (
                    <span
                        className="absolute top-0 left-0 w-0 h-0 rounded-tl border-t-[10px] border-t-sky-500 border-r-[10px] border-r-transparent"
                        role="img"
                        title={PENDING_CONSTRAINTS_LABEL}
                        aria-label={PENDING_CONSTRAINTS_LABEL}
                    />
                )}
            </button>
            </HoverCard.Trigger>

                {/* The Weekly Popup Grid. Radix keeps it inside the viewport (flips / shifts near the edges) */}
                {weekDates && weekDates.length > 0 && (
                    <HoverCard.Portal>
                    <HoverCard.Content
                        side="left"
                        align="start"
                        sideOffset={10}
                        collisionPadding={8}
                        className="bg-white border border-slate-300 shadow-2xl rounded-lg p-2 z-50 w-max min-w-[240px] cursor-default"
                        dir="rtl"
                    >
                        <div className="text-xs font-bold text-slate-700 mb-2 border-b pb-1">
                           {fullName}
                        </div>
                        {hasPendingConstraints && (
                            <div className="mb-2 text-[11px] text-sky-700">
                                {PENDING_CONSTRAINTS_LABEL} – מוצגת ברירת המחדל
                            </div>
                        )}
                        <table className="w-full text-center border-collapse">
                            <thead>
                                <tr>
                                    <th className="border border-slate-200 p-1 text-[10px] bg-slate-50 whitespace-nowrap">משמרת</th>
                                    {weekDates.map((date: string) => {
                                        const dayName = new Date(date).toLocaleDateString('he-IL', { weekday: 'narrow' });
                                        return <th key={`head-${date}`} className="border border-slate-200 p-1 text-[10px] bg-slate-50 min-w-[24px]">{dayName}'</th>
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {shifts.map(shift => (
                                    <tr key={`row-${shift.id}`}>
                                        <td className="border border-slate-200 px-1.5 py-1 text-[10px] font-semibold bg-slate-50 whitespace-nowrap">{shift.name}</td>
                                        {weekDates.map((date: string) => {
                                            const isAssigned = assignments.some(
                                                a => a.employee_id === emp.id && a.date === date && a.shift_id === shift.id
                                            );
                                            
                                            // 1. Find the specific constraint for this cell (instead of using .some)
                                            const currentConstraint = constraints.find(c => {
                                                const constraintDate = c.date ? c.date.split('T')[0] : '';
                                                return constraintDate === date && Number(c.shift_id) === Number(shift.id);
                                            });
                                            
                                            // 2. Determine background color dynamically based on constraint type
                                            let bgColorClass = 'bg-white';
                                            if (currentConstraint) {
                                                if (currentConstraint.constraint_type === 'cannot_work') {
                                                    bgColorClass = 'bg-red-200';
                                                } else if (currentConstraint.constraint_type === 'must_work') {
                                                    bgColorClass = 'bg-green-200';
                                                } else if (currentConstraint.constraint_type === 'prefer_to') {
                                                    bgColorClass = 'bg-blue-200';
                                                }
                                            }
                                            
                                            return (
                                                <td 
                                                    key={`cell-${date}-${shift.id}`} 
                                                    className={`border border-slate-200 p-1 text-[10px] h-6 transition-colors ${bgColorClass}`}
                                                >
                                                    {isAssigned && <Check size={12} strokeWidth={3} className="mx-auto text-slate-800" />}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Display the weekly note if it exists */}
                        {note && (
                            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-slate-700 whitespace-pre-wrap leading-relaxed text-right">
                                <span className="font-bold text-amber-800">הערה: </span>
                                {note}
                            </div>
                        )}
                    </HoverCard.Content>
                    </HoverCard.Portal>
                )}
            </HoverCard.Root>

            {/* 3. The Edit Button */}
            <button
                onClick={() => onEdit(emp.id)}
                className="h-8 w-8 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition shadow-sm shrink-0"
                title="ערוך משמרות והעדפות עובד"
            >
                <Edit size={14} />
            </button>

        </div>
        {showPositions && heldPositions.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-0.5 px-0.5">
                {heldPositions.map(position => (
                    <PositionBadge key={position.id} position={position} isPrimary={position.id === emp.primary_position_id} size="xs" />
                ))}
            </div>
        )}
        </div>
    );
}