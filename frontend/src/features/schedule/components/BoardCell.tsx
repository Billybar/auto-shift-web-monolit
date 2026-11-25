// src/features/schedule/components/BoardCell.tsx
import type { DragEvent } from 'react';
import { X, Plus, Minus } from 'lucide-react';

import type { Assignment, Employee, Position, ShiftDefinition } from '@/types';
import { toCssColor } from '@/lib/color';
import type { DragPayload, Placement, SlotTarget } from '@/features/schedule/hooks/scheduleEdits';
import { placementKey } from '@/features/schedule/hooks/useScheduleCheck';
import HoursBox from './HoursBox';

export interface BoardCellProps {
    shift: ShiftDefinition;
    position: Position;
    dateStr: string;
    // Which row of the role group this cell is in
    slotIndex: number;
    dividerClass: string;
    // Everyone in this shift, date and role, in row order
    cellAssignments: Assignment[];
    required: number;
    employeesMap: Record<number, Employee>;
    employeeLabels?: Map<number, string>;
    issuesByPlacement?: Map<string, string[]>;
    // Missing when the cell's demand can't be changed (an employee, or an archived role)
    onChangeSlots?: (delta: 1 | -1) => void;
    isPending: boolean;
    // Edits; missing for an employee, who only views the board (no drag, remove button or hours editor)
    onDrop?: (payload: DragPayload, target: SlotTarget) => void;
    onRemove?: (placement: Placement) => void;
    onUpdateHours?: (placement: Placement, startTime: string, endTime: string) => void;
}

/** One day of one board row: an assigned chip, an empty slot of the demand, or a blank cell. */
export default function BoardCell({
    shift,
    position,
    dateStr,
    slotIndex,
    dividerClass,
    cellAssignments,
    required,
    employeesMap,
    employeeLabels,
    issuesByPlacement,
    onChangeSlots,
    isPending,
    onDrop,
    onRemove,
    onUpdateHours,
}: BoardCellProps) {
    const slotAssignment = cellAssignments[slotIndex];
    const assignedEmp = slotAssignment ? employeesMap[slotAssignment.employee_id] : undefined;

    const fullName = assignedEmp?.user
        ? `${assignedEmp.user.first_name} ${assignedEmp.user.last_name}`.trim()
        : `Emp #${slotAssignment?.employee_id}`;
    // Compact label on the chip; the full name goes in the tooltip
    const displayName = (slotAssignment && employeeLabels?.get(slotAssignment.employee_id)) || fullName;

    // Exact cell rendering state, per role
    const hasAssignment = slotIndex < cellAssignments.length;
    const isExtraAssignment = hasAssignment && slotIndex >= required;
    const isEmptySlot = !hasAssignment && slotIndex < required;
    // Manual edits may place someone in a role they don't hold; auto-assign never does
    const lacksPosition = hasAssignment && !!assignedEmp && !assignedEmp.position_ids.includes(position.id);
    const checkIssues = slotAssignment
        ? issuesByPlacement?.get(placementKey(slotAssignment.employee_id, shift.id, dateStr))
        : undefined;
    // Red ring: breaks a hard rule; amber: above demand
    const cardBorderClass = checkIssues
        ? 'border-red-500 ring-1 ring-red-500'
        : isExtraAssignment ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-300';
    const cardTitle = [
        ...(slotAssignment ? [fullName] : []),
        ...(isExtraAssignment ? ['מעל התקן'] : []),
        ...(checkIssues ?? []),
    ].join('\n');

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        // Prevent creating hidden assignments on "Not Required" cells
        if (!isEmptySlot && !hasAssignment) return;
        const data = e.dataTransfer.getData('application/json');
        if (!data) return;
        const payload = JSON.parse(data) as DragPayload;
        if (!payload.employee_id) return;
        onDrop?.(payload, {
            shiftId: shift.id,
            date: dateStr,
            positionId: position.id,
            employeeId: slotAssignment ? slotAssignment.employee_id : null,
        });
    };

    return (
        <td
            className={`p-1 border-b border-r align-middle bg-white hover:bg-slate-50 transition-colors ${dividerClass}`}
            onDragOver={onDrop && ((e) => e.preventDefault())}
            onDrop={onDrop && handleDrop}
        >
            {/* State 1: Assigned Employee Card */}
            {hasAssignment && slotAssignment && (
                <div
                    draggable={!!onDrop}
                    onDragStart={onDrop && ((e) => {
                        const payload: DragPayload = {
                            type: 'FROM_BOARD',
                            employee_id: slotAssignment.employee_id,
                            shift_id: shift.id,
                            date: dateStr,
                            position_id: position.id,
                        };
                        e.dataTransfer.setData('application/json', JSON.stringify(payload));
                    })}
                    className={`group relative w-[90%] max-w-[5.5rem] xl:max-w-[7.5rem] 2xl:max-w-[11rem] h-[3.5rem] mx-auto rounded border flex flex-col shadow-sm overflow-hidden bg-white ${onDrop ? 'cursor-grab active:cursor-grabbing transition hover:shadow-md' : 'cursor-default'} ${cardBorderClass}`}
                    title={cardTitle}
                >
                    <div
                        className="w-full flex-1 flex items-center justify-center border-b border-slate-200"
                        style={{
                            backgroundColor: toCssColor(assignedEmp?.color),
                            color: '#1e293b'
                        }}
                    >
                        <span className="text-xs font-semibold truncate px-1 w-full text-center">
                            {displayName}
                        </span>
                    </div>
                    {/* Amber corner: the employee doesn't hold this chip's role */}
                    {lacksPosition && (
                        <div
                            className="absolute top-0 left-0 w-0 h-0 border-t-[12px] border-t-amber-500 border-r-[12px] border-r-transparent"
                            title={`לעובד לא מוגדר התפקיד ${position.name}`}
                            aria-label={`לעובד לא מוגדר התפקיד ${position.name}`}
                        />
                    )}
                    <HoursBox
                        assignmentStartTime={slotAssignment.start_time}
                        assignmentEndTime={slotAssignment.end_time}
                        defaultStartTime={shift.start_time}
                        defaultEndTime={shift.end_time}
                        onSave={onUpdateHours && ((start, end) => {
                            onUpdateHours({ employeeId: slotAssignment.employee_id, shiftId: shift.id, date: dateStr }, start, end);
                        })}
                    />
                    {onRemove && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove({ employeeId: slotAssignment.employee_id, shiftId: shift.id, date: dateStr });
                            }}
                            className="absolute top-0.5 right-0.5 z-10 bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="הסר עובד"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            )}

            {/* State 2: Empty Slot (Drop Zone) with always-visible gray Minus Button */}
            {isEmptySlot && (
                <div className="group relative w-[90%] h-[3.5rem] mx-auto flex items-center justify-center">
                    {onChangeSlots && (
                        <button
                            onClick={() => onChangeSlots(-1)}
                            disabled={isPending}
                            className="flex w-7 h-7 items-center justify-center rounded-full text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                            title="הסר עמדה"
                        >
                            <Minus size={16} />
                        </button>
                    )}
                </div>
            )}

            {/* State 3: Not Required (Blank) with Hover Plus Button */}
            {!hasAssignment && !isEmptySlot && (
                <div className="group h-10 w-full flex items-center justify-center">
                    {onChangeSlots && (
                        <button
                            onClick={() => onChangeSlots(1)}
                            disabled={isPending}
                            className="hidden group-hover:flex w-7 h-7 items-center justify-center bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition-colors disabled:opacity-50"
                            title="הוסף עמדה"
                        >
                            <Plus size={16} />
                        </button>
                    )}
                </div>
            )}
        </td>
    );
}
