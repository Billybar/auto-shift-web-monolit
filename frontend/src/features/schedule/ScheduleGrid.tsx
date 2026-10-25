// src/features/schedule/ScheduleGrid.tsx
import React, { useMemo, useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { X, Plus, Minus, Pencil } from 'lucide-react';

import type { Assignment, Employee, Position, ShiftDayDemand, ShiftDefinition } from '../../types';
import { toCssColor } from '../../lib/color';
import { demandKey } from './hooks/useWeeklyDemand';
import type { Placement, Slot } from './hooks/scheduleEdits';

// What a chip carries while dragged (also set by the employee sidebar)
export type DragPayload =
    | { type: 'FROM_SIDEBAR'; employee_id: number }
    | { type: 'FROM_BOARD'; employee_id: number; shift_id: number; date: string; position_id: number };

// The slot a chip was dropped on, and who is in it now
export interface SlotTarget extends Slot {
    employeeId: number | null;
}

// 1. THE CONTRACT: Everything the Grid needs to function
export interface ScheduleGridProps {
    weekDates: Date[];
    shiftDefinitions: ShiftDefinition[];
    // All roles of the location in display order; archived ones label past assignments
    positions: Position[];
    // Keyed by demandKey(shiftId, date, positionId)
    demandMap: Record<string, ShiftDayDemand>;
    pendingCells?: Set<string>;
    onChangeSlots?: (shiftId: number, dateStr: string, positionId: number, delta: 1 | -1) => void;
    assignments: Assignment[];
    employeesMap: Record<number, Employee>;

    // Helper function used in the HTML
    formatDateStr: (d: Date) => string;

    // Event Handlers for Drag & Drop
    onDrop: (e: React.DragEvent, target: SlotTarget) => void;
    onRemove: (placement: Placement) => void;
    onUpdateHours?: (placement: Placement, startTime: string, endTime: string) => void;
}

// The rows of one role inside a shift
interface RoleGroup {
    position: Position;
    rows: number;
    // Rows the week's demand and assignments need (manual rows can only add to it)
    baseRows: number;
}

const manualRowsKey = (shiftId: number, positionId: number) => `${shiftId}|${positionId}`;

// Helper component for the hours display and editing
function HoursBox({
    assignmentStartTime,
    assignmentEndTime,
    defaultStartTime,
    defaultEndTime,
    onSave
}: {
    assignmentStartTime?: string | null,
    assignmentEndTime?: string | null,
    defaultStartTime: string,
    defaultEndTime: string,
    onSave: (start: string, end: string) => void
}) {
    const [isEditing, setIsEditing] = React.useState(false);
    const [startInput, setStartInput] = React.useState(assignmentStartTime || defaultStartTime);
    const [endInput, setEndInput] = React.useState(assignmentEndTime || defaultEndTime);

    const isStartChanged = assignmentStartTime && assignmentStartTime !== defaultStartTime;
    const isEndChanged = assignmentEndTime && assignmentEndTime !== defaultEndTime;

    const displayStart = assignmentStartTime || defaultStartTime;
    const displayEnd = assignmentEndTime || defaultEndTime;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // prevent drag or other interactions
        setIsEditing(true);
    };

    const handleSave = () => {
        setIsEditing(false);
        // Only save if there's a valid change
        if (startInput !== (assignmentStartTime || defaultStartTime) || endInput !== (assignmentEndTime || defaultEndTime)) {
            onSave(startInput, endInput);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setStartInput(assignmentStartTime || defaultStartTime);
            setEndInput(assignmentEndTime || defaultEndTime);
        }
    };

    if (isEditing) {
        return (
            <div
                className="h-5 flex-none flex items-center justify-center gap-1 bg-stone-200 text-black w-full shadow-inner z-20"
                onClick={e => e.stopPropagation()} // prevent drag
                onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        handleSave();
                    }
                }}
                dir="ltr"
            >
                <input
                    type="time"
                    value={startInput}
                    onChange={e => setStartInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    className="w-16 text-xs p-0 border border-gray-300 rounded text-center bg-white h-5 outline-none focus:border-blue-400"
                />
                <span className="text-xs leading-none text-slate-500">-</span>
                <input
                    type="time"
                    value={endInput}
                    onChange={e => setEndInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-16 text-xs p-0 border border-gray-300 rounded text-center bg-white h-5 outline-none focus:border-blue-400"
                />
            </div>
        );
    }

    return (
        <div
            onClick={handleClick}
            className="h-5 flex-none flex items-center justify-center gap-1 bg-stone-200 text-stone-400 w-full cursor-pointer hover:bg-stone-300 transition"
            title="לחץ לעריכת שעות"
            dir="ltr"
        >
            <span className={`text-xs leading-none px-1.5 py-0.5 ${isStartChanged ? 'bg-blue-500 text-white rounded' : ''}`}>
                {displayStart}
            </span>
            <span className="text-xs leading-none text-slate-400">-</span>
            <span className={`text-xs leading-none px-1.5 py-0.5 ${isEndChanged ? 'bg-blue-500 text-white rounded' : ''}`}>
                {displayEnd}
            </span>
        </div>
    );
}

// Helper component for the edit menu of one shift + role group (add / remove an extra row)
function ShiftEditMenu({
    canRemove,
    onAddRow,
    onRemoveRow
}: {
    // The group has an extra empty row that can be removed
    canRemove: boolean,
    onAddRow: () => void,
    onRemoveRow: () => void
}) {
    // Portaled to <body>: inside the sticky label cell the menu was trapped in the cell's stacking
    // context, so the next rows' sticky cells painted over it and the scroll container clipped it
    return (
        <DropdownMenu.Root dir="rtl" modal={false}>
            <DropdownMenu.Trigger asChild>
                <button
                    className="p-1 rounded transition-colors text-slate-400 hover:text-slate-700 hover:bg-slate-100 data-[state=open]:bg-slate-200 data-[state=open]:text-slate-700"
                    title="עריכת משמרת"
                >
                    <Pencil size={14} />
                </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="start"
                    sideOffset={4}
                    collisionPadding={8}
                    className="z-50 min-w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1"
                >
                    <DropdownMenu.Item
                        onSelect={onAddRow}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 outline-none cursor-pointer data-[highlighted]:bg-slate-100 transition-colors whitespace-nowrap"
                    >
                        <Plus size={14} /> הוסף שורה
                    </DropdownMenu.Item>
                    {canRemove && (
                        <DropdownMenu.Item
                            onSelect={onRemoveRow}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 outline-none cursor-pointer data-[highlighted]:bg-red-50 transition-colors whitespace-nowrap"
                        >
                            <Minus size={14} /> הסר שורה ריקה
                        </DropdownMenu.Item>
                    )}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}

// 2. THE COMPONENT SHELL
export default function ScheduleGrid({
    weekDates,
    shiftDefinitions,
    positions,
    demandMap,
    pendingCells,
    onChangeSlots,
    assignments,
    employeesMap,
    formatDateStr,
    onDrop,
    onRemove,
    onUpdateHours
}: ScheduleGridProps) {

    const assignmentsByCell = useMemo(() => {
        const map: Record<string, Assignment[]> = {};
        assignments.forEach(a => {
            const key = demandKey(a.shift_id, a.date, a.position_id);
            if (!map[key]) map[key] = [];
            map[key].push(a);
        });
        return map;
    }, [assignments]);

    // UI-only minimum row count per shift and role (keyed by manualRowsKey), set via the shift edit menu
    const [manualRows, setManualRows] = useState<Record<string, number>>({});

    const dateStrs = useMemo(() => weekDates.map(formatDateStr), [weekDates, formatDateStr]);
    const activePositions = useMemo(() => positions.filter(p => p.is_active), [positions]);

    // Demand of a role cell; archived roles have none
    const requiredFor = (shiftId: number, dateStr: string, position: Position) =>
        position.is_active ? (demandMap[demandKey(shiftId, dateStr, position.id)]?.required_employees ?? 0) : 0;

    // Which role groups each shift shows: a role with demand on any day this week, assignments this
    // week, or rows added from the shift menu. A shift with none shows one row of its first role.
    const groupsByShift = useMemo(() => {
        const result: Record<number, RoleGroup[]> = {};
        shiftDefinitions.forEach(shift => {
            const groups: RoleGroup[] = [];
            positions.forEach(position => {
                let baseRows = 0;
                dateStrs.forEach(dateStr => {
                    const required = position.is_active
                        ? (demandMap[demandKey(shift.id, dateStr, position.id)]?.required_employees ?? 0)
                        : 0;
                    const assigned = (assignmentsByCell[demandKey(shift.id, dateStr, position.id)] || []).length;
                    baseRows = Math.max(baseRows, required, assigned);
                });
                // Manual rows act as a floor, so filling an extra row does not spawn another one
                const manual = manualRows[manualRowsKey(shift.id, position.id)] ?? 0;
                if (baseRows > 0 || manual > 0) {
                    groups.push({ position, rows: Math.max(baseRows, manual), baseRows });
                }
            });
            const fallback = activePositions[0] ?? positions[0];
            if (groups.length === 0 && fallback) {
                groups.push({ position: fallback, rows: 1, baseRows: 1 });
            }
            result[shift.id] = groups;
        });
        return result;
    }, [shiftDefinitions, positions, activePositions, dateStrs, demandMap, assignmentsByCell, manualRows]);

    // With a single role on screen the labels leave out the archived-role note, so the board looks as it did before roles
    const showRoles = useMemo(() => {
        const shown = new Set<number>();
        Object.values(groupsByShift).forEach(groups => groups.forEach(g => shown.add(g.position.id)));
        return shown.size > 1;
    }, [groupsByShift]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-grow overflow-auto flex flex-col">
            <table className="w-full text-left border-collapse min-w-max">
                <thead>
                    <tr>
                        {/* Header cells are sticky; shadows replace borders, which scroll away under border-collapse */}
                        <th className="p-3 border-b border-r bg-slate-50 font-semibold text-slate-700 w-36 sticky top-0 left-0 z-30 shadow-[1px_1px_0_0_#e5e7eb] text-right">
                           משמרת
                        </th>
                        {weekDates.map((date, idx) => (
                            <th key={idx} className="p-3 border-b border-r bg-slate-50 text-center w-32 sticky top-0 z-20 shadow-[0_1px_0_0_#e5e7eb]">
                                <div className="font-semibold text-slate-700">
                                    {date.toLocaleDateString('he-IL', { weekday: 'short' })}
                                </div>
                                <div className="text-xs text-slate-500">
                                    {date.toLocaleDateString('he-IL', { month: 'numeric', day: 'numeric' })}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {shiftDefinitions.map((shift, shiftIndex) => {
                        const groups = groupsByShift[shift.id] ?? [];
                        const prevShift = shiftDefinitions[shiftIndex - 1];
                        // Shifts with the same hours as the one above read as one block, so they get the thin divider
                        const sameHoursAsPrev = !!prevShift && prevShift.start_time === shift.start_time && prevShift.end_time === shift.end_time;

                        return groups.map((group, groupIndex) => Array.from({ length: group.rows }).map((_, slotIndex) => {
                            const position = group.position;
                            const isFirstShiftRow = groupIndex === 0 && slotIndex === 0;
                            // Thick line between shifts, thin line between the roles of a shift or shifts with the same hours
                            const dividerClass = isFirstShiftRow && shiftIndex > 0 && !sameHoursAsPrev
                                ? "border-t-[6px] border-t-slate-400"
                                : ((isFirstShiftRow && sameHoursAsPrev) || (slotIndex === 0 && groupIndex > 0) ? "border-t-2 border-t-slate-300" : "");

                            return (
                                <tr key={`${shift.id}-${position.id}-slot-${slotIndex}`} className="hover:bg-slate-50/50 transition">
                                {/* One label per role group: shift, role and hours, so each group reads as its own shift */}
                                {slotIndex === 0 && (
                                    <td rowSpan={group.rows} className={`p-3 border-b border-r bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb] align-top text-right ${dividerClass}`}>
                                        <div className="flex items-center gap-1">
                                            {/* The menu edits this group's rows only; archived roles can't get rows */}
                                            {onChangeSlots && position.is_active && (
                                                <ShiftEditMenu
                                                    canRemove={group.rows > group.baseRows}
                                                    onAddRow={() => setManualRows(prev => ({ ...prev, [manualRowsKey(shift.id, position.id)]: group.rows + 1 }))}
                                                    onRemoveRow={() => setManualRows(prev => ({ ...prev, [manualRowsKey(shift.id, position.id)]: group.rows - 1 }))}
                                                />
                                            )}
                                            <div className="font-medium text-slate-800">{shift.name}</div>
                                        </div>
                                        {showRoles && !position.is_active && <div className="text-[10px] text-slate-500 mt-0.5">(בארכיון)</div>}
                                        <div className="text-xs text-slate-500" dir="ltr" style={{ display: 'inline-block' }}>{shift.start_time} - {shift.end_time}</div>
                                    </td>
                                )}
                                {dateStrs.map((dateStr, dayIdx) => {
                                    const cellKey = demandKey(shift.id, dateStr, position.id);

                                    const requiredForThisDay = requiredFor(shift.id, dateStr, position);
                                    const cellAssignments = assignmentsByCell[cellKey] || [];
                                    const assignedCount = cellAssignments.length;

                                    const slotAssignment = cellAssignments[slotIndex];
                                    const assignedEmp = slotAssignment ? employeesMap[slotAssignment.employee_id] : undefined;

                                    const fallbackName = `Emp #${slotAssignment?.employee_id}`;
                                    const displayFirstName = assignedEmp?.user
                                        ? `${assignedEmp.user.first_name} ${assignedEmp.user.last_name}`.trim()
                                        : fallbackName;

                                    // Exact cell rendering state, per role
                                    const hasAssignment = slotIndex < assignedCount;
                                    const isExtraAssignment = hasAssignment && slotIndex >= requiredForThisDay;
                                    const isEmptySlot = !hasAssignment && slotIndex < requiredForThisDay;
                                    // Manual edits may place someone in a role they don't hold; auto-assign never does
                                    const lacksPosition = hasAssignment && !!assignedEmp && !assignedEmp.position_ids.includes(position.id);
                                    // Demand of archived roles can't be edited
                                    const canChangeSlots = !!onChangeSlots && position.is_active && cellKey in demandMap;

                                    const isPending = pendingCells?.has(cellKey);
                                    const finalBgClass = `p-1 border-b border-r align-middle bg-white hover:bg-slate-50 transition-colors ${dividerClass}`;

                                    return (
                                        <td
                                                key={dayIdx}
                                                className={finalBgClass}
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    // Prevent creating hidden assignments on "Not Required" cells
                                                    if (isEmptySlot || hasAssignment) {
                                                        onDrop(e, {
                                                            shiftId: shift.id,
                                                            date: dateStr,
                                                            positionId: position.id,
                                                            employeeId: slotAssignment ? slotAssignment.employee_id : null,
                                                        });
                                                    }
                                                }}
                                            >

                                            {/* State 1: Assigned Employee Card */}
                                            {hasAssignment && slotAssignment && (
                                                <div
                                                    draggable
                                                    onDragStart={(e) => {
                                                        const payload: DragPayload = {
                                                            type: 'FROM_BOARD',
                                                            employee_id: slotAssignment.employee_id,
                                                            shift_id: shift.id,
                                                            date: dateStr,
                                                            position_id: position.id,
                                                        };
                                                        e.dataTransfer.setData('application/json', JSON.stringify(payload));
                                                    }}
                                                    // Amber ring for extra assignments
                                                    className={`group relative w-[90%] max-w-[5.5rem] xl:max-w-[7.5rem] 2xl:max-w-[11rem] h-[3.5rem] mx-auto rounded border flex flex-col shadow-sm cursor-grab active:cursor-grabbing transition hover:shadow-md overflow-hidden bg-white ${isExtraAssignment ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-300'}`}
                                                    title={isExtraAssignment ? 'מעל התקן' : ''}
                                                >
                                                    <div
                                                        className="w-full flex-1 flex items-center justify-center border-b border-slate-200"
                                                        style={{
                                                            backgroundColor: toCssColor(assignedEmp?.color),
                                                            color: '#1e293b'
                                                        }}
                                                    >
                                                        <span className="text-xs font-semibold truncate px-1 w-full text-center">
                                                            {displayFirstName}
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
                                                        onSave={(start, end) => {
                                                            onUpdateHours?.({ employeeId: slotAssignment.employee_id, shiftId: shift.id, date: dateStr }, start, end);
                                                        }}
                                                    />
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
                                                </div>
                                            )}

                                            {/* State 2: Empty Slot (Drop Zone) with always-visible gray Minus Button */}
                                            {isEmptySlot && (
                                                <div className="group relative w-[90%] h-[3.5rem] mx-auto flex items-center justify-center">
                                                    {canChangeSlots && (
                                                        <button
                                                            onClick={() => onChangeSlots?.(shift.id, dateStr, position.id, -1)}
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
                                                    {canChangeSlots && (
                                                        <button
                                                            onClick={() => onChangeSlots?.(shift.id, dateStr, position.id, 1)}
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
                                })}
                            </tr>
                        )}));
                    })}
                </tbody>
            </table>
        </div>
    );
}
