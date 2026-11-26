// src/features/schedule/ScheduleGrid.tsx
import { useMemo, useState } from 'react';

import type { Assignment, Employee, Position, ShiftDayDemand, ShiftDefinition } from '@/types';
import { demandKey } from './hooks/useWeeklyDemand';
import type { DragPayload, Placement, SlotTarget } from './hooks/scheduleEdits';
import { buildRoleGroups, groupByCell, manualRowsKey } from './hooks/scheduleGridRows';
import { toDateStr } from './hooks/scheduleWeek';
import BoardCell from './components/BoardCell';
import ReadOnlyChip from './components/ReadOnlyChip';
import ShiftEditMenu from './components/ShiftEditMenu';

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
    // Compact chip label per employee id; chips show the full name when missing
    employeeLabels?: Map<number, string>;
    // The last schedule check's messages per card, keyed by placementKey(employeeId, shiftId, date)
    issuesByPlacement?: Map<string, string[]>;
    // The Saturday before the week, shown read-only before Sunday (staff only).
    // assignments: as saved in the DB; null when they failed to load
    previousDay?: { date: Date; assignments: Assignment[] | null };

    // Edits; missing for an employee, who only views the board
    onDrop?: (payload: DragPayload, target: SlotTarget) => void;
    onRemove?: (placement: Placement) => void;
    onUpdateHours?: (placement: Placement, startTime: string, endTime: string) => void;
}

export default function ScheduleGrid({
    weekDates,
    shiftDefinitions,
    positions,
    demandMap,
    pendingCells,
    onChangeSlots,
    assignments,
    employeesMap,
    employeeLabels,
    issuesByPlacement,
    previousDay,
    onDrop,
    onRemove,
    onUpdateHours
}: ScheduleGridProps) {
    const assignmentsByCell = useMemo(() => groupByCell(assignments), [assignments]);

    // The read-only previous-day column (undefined: not shown)
    const prevDateStr = previousDay ? toDateStr(previousDay.date) : null;
    const prevAssignments = previousDay?.assignments;
    const prevAssignmentsByCell = useMemo(() => groupByCell(prevAssignments ?? []), [prevAssignments]);

    // UI-only minimum row count per shift and role (keyed by manualRowsKey), set via the shift edit menu
    const [manualRows, setManualRows] = useState<Record<string, number>>({});

    const dateStrs = useMemo(() => weekDates.map(toDateStr), [weekDates]);

    const groupsByShift = useMemo(() => buildRoleGroups({
        shifts: shiftDefinitions,
        positions,
        dateStrs,
        demandMap,
        assignmentsByCell,
        previousDay: prevDateStr ? { dateStr: prevDateStr, assignmentsByCell: prevAssignmentsByCell } : undefined,
        manualRows,
    }), [shiftDefinitions, positions, dateStrs, demandMap, assignmentsByCell, prevDateStr, prevAssignmentsByCell, manualRows]);

    // With a single role on screen the labels leave out the archived-role note, so the board looks as it did before roles
    const showRoles = useMemo(() => {
        const shown = new Set<number>();
        Object.values(groupsByShift).forEach(groups => groups.forEach(g => shown.add(g.position.id)));
        return shown.size > 1;
    }, [groupsByShift]);

    const setRows = (shiftId: number, positionId: number, rows: number) =>
        setManualRows(prev => ({ ...prev, [manualRowsKey(shiftId, positionId)]: rows }));

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-grow overflow-auto flex flex-col">
            <table className="w-full text-left border-collapse min-w-max">
                <thead>
                    <tr>
                        {/* Header cells are sticky; shadows replace borders, which scroll away under border-collapse.
                            The inset shadow is the thick line under the header (slate-400, like the line between shifts) */}
                        <th className="p-3 border-b border-r bg-slate-50 font-semibold text-slate-700 w-36 sticky top-0 left-0 z-30 shadow-[1px_0_0_0_#e5e7eb,inset_0_-6px_0_0_#94a3b8] text-right">
                           משמרת
                        </th>
                        {/* Read-only: last Saturday as saved, so the week's start can be planned around it */}
                        {previousDay && (
                            <th className="p-3 border-b border-r border-l-2 border-l-slate-300 bg-slate-100 text-center w-24 sticky top-0 z-20 shadow-[inset_0_-6px_0_0_#94a3b8]">
                                <div className="font-semibold text-slate-400">
                                    {previousDay.date.toLocaleDateString('he-IL', { weekday: 'short' })}
                                </div>
                                <div className="text-xs text-slate-300">
                                    {previousDay.date.toLocaleDateString('he-IL', { month: 'numeric', day: 'numeric' })}
                                </div>
                                {previousDay.assignments === null && (
                                    <div className="text-[10px] text-red-500">לא נטען</div>
                                )}
                            </th>
                        )}
                        {weekDates.map((date, idx) => (
                            <th key={idx} className="p-3 border-b border-r bg-slate-50 text-center w-32 sticky top-0 z-20 shadow-[inset_0_-6px_0_0_#94a3b8]">
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
                                                    onAddRow={() => setRows(shift.id, position.id, group.rows + 1)}
                                                    onRemoveRow={() => setRows(shift.id, position.id, group.rows - 1)}
                                                />
                                            )}
                                            <div className="font-medium text-slate-800">{shift.name}</div>
                                        </div>
                                        {showRoles && !position.is_active && <div className="text-[10px] text-slate-500 mt-0.5">(בארכיון)</div>}
                                        <div className="text-xs text-slate-500" dir="ltr" style={{ display: 'inline-block' }}>{shift.start_time} - {shift.end_time}</div>
                                    </td>
                                )}
                                {/* Previous-day cell: no drop handlers, so nothing can be dropped here */}
                                {prevDateStr && (() => {
                                    const prevAssignment = (prevAssignmentsByCell[demandKey(shift.id, prevDateStr, position.id)] || [])[slotIndex];
                                    return (
                                        <td className={`p-1 border-b border-r border-l-2 border-l-slate-300 align-middle bg-slate-50 ${dividerClass}`}>
                                            {prevAssignment ? (
                                                <ReadOnlyChip
                                                    assignment={prevAssignment}
                                                    employee={employeesMap[prevAssignment.employee_id]}
                                                    label={employeeLabels?.get(prevAssignment.employee_id)}
                                                    shift={shift}
                                                />
                                            ) : (
                                                <div className="h-10 w-full" />
                                            )}
                                        </td>
                                    );
                                })()}
                                {dateStrs.map((dateStr) => {
                                    const cellKey = demandKey(shift.id, dateStr, position.id);
                                    // Archived roles have no demand, and theirs can't be edited
                                    const required = position.is_active ? (demandMap[cellKey]?.required_employees ?? 0) : 0;
                                    const canChangeSlots = !!onChangeSlots && position.is_active && cellKey in demandMap;

                                    return (
                                        <BoardCell
                                            key={dateStr}
                                            shift={shift}
                                            position={position}
                                            dateStr={dateStr}
                                            slotIndex={slotIndex}
                                            dividerClass={dividerClass}
                                            cellAssignments={assignmentsByCell[cellKey] ?? []}
                                            required={required}
                                            employeesMap={employeesMap}
                                            employeeLabels={employeeLabels}
                                            issuesByPlacement={issuesByPlacement}
                                            onChangeSlots={canChangeSlots ? (delta) => onChangeSlots(shift.id, dateStr, position.id, delta) : undefined}
                                            isPending={!!pendingCells?.has(cellKey)}
                                            onDrop={onDrop}
                                            onRemove={onRemove}
                                            onUpdateHours={onUpdateHours}
                                        />
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
