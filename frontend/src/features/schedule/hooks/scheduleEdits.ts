// src/features/schedule/hooks/scheduleEdits.ts
// Pure edits of the board's assignments. The rule is "the slot owns the role": an employee placed
// in a slot fills that slot's role, and a swap exchanges people while roles and hours stay put.
// Every edit returns the new list, or null when it would put the same employee in a cell
// (shift + date) twice.
import type { Assignment } from '../../../types';

// A role slot on the board
export interface Slot {
    shiftId: number;
    date: string;
    positionId: number;
}

// An employee's place on the board (one per cell)
export interface Placement {
    employeeId: number;
    shiftId: number;
    date: string;
}

const isPlacement = (a: Assignment, p: Placement) =>
    a.employee_id === p.employeeId && a.shift_id === p.shiftId && a.date === p.date;

const isInCell = (assignments: Assignment[], employeeId: number, shiftId: number, date: string) =>
    assignments.some(a => a.employee_id === employeeId && a.shift_id === shiftId && a.date === date);

/** Adds the employee to an empty slot, in the slot's role. */
export function addToSlot(assignments: Assignment[], employeeId: number, slot: Slot): Assignment[] | null {
    if (isInCell(assignments, employeeId, slot.shiftId, slot.date)) return null;
    return [...assignments, { employee_id: employeeId, shift_id: slot.shiftId, date: slot.date, position_id: slot.positionId }];
}

/**
 * Puts another employee in an occupied slot. The slot keeps its role; the new employee starts
 * with the shift's default hours (as before roles, and as on mobile).
 */
export function replaceInSlot(assignments: Assignment[], current: Placement, employeeId: number): Assignment[] | null {
    if (employeeId === current.employeeId) return assignments;
    if (isInCell(assignments, employeeId, current.shiftId, current.date)) return null;
    return assignments.map(a => (isPlacement(a, current)
        ? { location_id: a.location_id, employee_id: employeeId, shift_id: a.shift_id, date: a.date, position_id: a.position_id }
        : a));
}

/**
 * Moves an employee to an empty slot, taking the slot's role. A move inside the same cell
 * only changes the role.
 */
export function moveToSlot(assignments: Assignment[], from: Placement, slot: Slot): Assignment[] | null {
    const sameCell = from.shiftId === slot.shiftId && from.date === slot.date;
    if (!sameCell && isInCell(assignments, from.employeeId, slot.shiftId, slot.date)) return null;
    return assignments.map(a => (isPlacement(a, from)
        ? { ...a, shift_id: slot.shiftId, date: slot.date, position_id: slot.positionId }
        : a));
}

/** Exchanges two employees; roles and hours stay with the slots. */
export function swapPlacements(assignments: Assignment[], first: Placement, second: Placement): Assignment[] | null {
    const sameCell = first.shiftId === second.shiftId && first.date === second.date;
    if (!sameCell && (
        isInCell(assignments, first.employeeId, second.shiftId, second.date) ||
        isInCell(assignments, second.employeeId, first.shiftId, first.date)
    )) return null;
    return assignments.map(a => {
        if (isPlacement(a, first)) return { ...a, employee_id: second.employeeId };
        if (isPlacement(a, second)) return { ...a, employee_id: first.employeeId };
        return a;
    });
}

export function removePlacement(assignments: Assignment[], placement: Placement): Assignment[] {
    return assignments.filter(a => !isPlacement(a, placement));
}

export function setPlacementHours(assignments: Assignment[], placement: Placement, startTime: string, endTime: string): Assignment[] {
    return assignments.map(a => (isPlacement(a, placement) ? { ...a, start_time: startTime, end_time: endTime } : a));
}
