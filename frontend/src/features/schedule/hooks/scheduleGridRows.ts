// src/features/schedule/hooks/scheduleGridRows.ts
// How many rows each shift shows on the board, per role
import type { Assignment, Position, ShiftDayDemand, ShiftDefinition } from '../../../types';
import { demandKey } from './useWeeklyDemand';

// The rows of one role inside a shift
export interface RoleGroup {
    position: Position;
    rows: number;
    // Rows the week's demand and assignments need (manual rows can only add to it)
    baseRows: number;
}

export const manualRowsKey = (shiftId: number, positionId: number) => `${shiftId}|${positionId}`;

/** Assignments by demandKey(shift, date, role), in list order. */
export const groupByCell = (assignments: Assignment[]): Record<string, Assignment[]> => {
    const map: Record<string, Assignment[]> = {};
    assignments.forEach(a => {
        const key = demandKey(a.shift_id, a.date, a.position_id);
        (map[key] ??= []).push(a);
    });
    return map;
};

interface RoleGroupsInput {
    shifts: ShiftDefinition[];
    // All roles in display order; archived ones only show for their assignments
    positions: Position[];
    dateStrs: string[];
    demandMap: Record<string, ShiftDayDemand>;
    assignmentsByCell: Record<string, Assignment[]>;
    // The read-only day before the week; its people need rows too, its demand doesn't count
    previousDay?: { dateStr: string; assignmentsByCell: Record<string, Assignment[]> };
    // Minimum rows per manualRowsKey, added from the shift menu
    manualRows: Record<string, number>;
}

/**
 * The role groups of each shift: a role shows when it has demand on any day of the week,
 * assignments, or rows added from the shift menu, with as many rows as its busiest day.
 * A shift with none shows one row of its first role.
 */
export function buildRoleGroups({
    shifts, positions, dateStrs, demandMap, assignmentsByCell, previousDay, manualRows,
}: RoleGroupsInput): Record<number, RoleGroup[]> {
    const fallback = positions.find(p => p.is_active) ?? positions[0];
    const result: Record<number, RoleGroup[]> = {};

    shifts.forEach(shift => {
        const groups: RoleGroup[] = [];
        positions.forEach(position => {
            let baseRows = 0;
            dateStrs.forEach(dateStr => {
                const key = demandKey(shift.id, dateStr, position.id);
                // Archived roles have no demand
                const required = position.is_active ? (demandMap[key]?.required_employees ?? 0) : 0;
                baseRows = Math.max(baseRows, required, assignmentsByCell[key]?.length ?? 0);
            });
            if (previousDay) {
                const key = demandKey(shift.id, previousDay.dateStr, position.id);
                baseRows = Math.max(baseRows, previousDay.assignmentsByCell[key]?.length ?? 0);
            }
            // Manual rows act as a floor, so filling an extra row does not spawn another one
            const manual = manualRows[manualRowsKey(shift.id, position.id)] ?? 0;
            if (baseRows > 0 || manual > 0) {
                groups.push({ position, rows: Math.max(baseRows, manual), baseRows });
            }
        });
        if (groups.length === 0 && fallback) {
            groups.push({ position: fallback, rows: 1, baseRows: 1 });
        }
        result[shift.id] = groups;
    });
    return result;
}
