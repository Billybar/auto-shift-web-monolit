// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Assignment } from '@/types';
import {
    addToSlot,
    applyDrop,
    moveToSlot,
    removePlacement,
    replaceInSlot,
    setPlacementHours,
    swapPlacements,
} from './scheduleEdits';

// Fixed ids: two shifts, two roles, two dates
const MORNING = 1;
const EVENING = 2;
const GUARD = 10;
const SUPERVISOR = 20;
const SUN = '2026-11-29';
const MON = '2026-11-30';

const assignment = (
    employee_id: number,
    shift_id: number,
    date: string,
    position_id: number,
    extra: Partial<Assignment> = {},
): Assignment => ({ employee_id, shift_id, date, position_id, ...extra });

describe('addToSlot', () => {
    it('adds the employee in the slot role', () => {
        const result = addToSlot([], 7, { shiftId: MORNING, date: SUN, positionId: GUARD });
        expect(result).toEqual([assignment(7, MORNING, SUN, GUARD)]);
    });

    it('refuses an employee who is already in the cell, even in another role', () => {
        const board = [assignment(7, MORNING, SUN, SUPERVISOR)];
        expect(addToSlot(board, 7, { shiftId: MORNING, date: SUN, positionId: GUARD })).toBeNull();
    });

    it('allows the same employee in another shift or on another day', () => {
        const board = [assignment(7, MORNING, SUN, GUARD)];
        expect(addToSlot(board, 7, { shiftId: EVENING, date: SUN, positionId: GUARD })).toHaveLength(2);
        expect(addToSlot(board, 7, { shiftId: MORNING, date: MON, positionId: GUARD })).toHaveLength(2);
    });

    it('does not change the list it was given', () => {
        const board = [assignment(7, MORNING, SUN, GUARD)];
        addToSlot(board, 8, { shiftId: MORNING, date: SUN, positionId: GUARD });
        expect(board).toHaveLength(1);
    });
});

describe('replaceInSlot', () => {
    const current = { employeeId: 7, shiftId: MORNING, date: SUN };

    it('puts the new employee in the slot, which keeps its role', () => {
        const board = [assignment(7, MORNING, SUN, SUPERVISOR, { location_id: 3 })];
        expect(replaceInSlot(board, current, 8)).toEqual([
            { location_id: 3, employee_id: 8, shift_id: MORNING, date: SUN, position_id: SUPERVISOR },
        ]);
    });

    it("drops the previous employee's custom hours and id", () => {
        const board = [assignment(7, MORNING, SUN, GUARD, { id: 99, start_time: '07:00', end_time: '13:00' })];
        const [replaced] = replaceInSlot(board, current, 8)!;
        expect(replaced.id).toBeUndefined();
        expect(replaced.start_time).toBeUndefined();
        expect(replaced.end_time).toBeUndefined();
    });

    it('returns the same list when the employee replaces themselves', () => {
        const board = [assignment(7, MORNING, SUN, GUARD)];
        expect(replaceInSlot(board, current, 7)).toBe(board);
    });

    it('refuses an employee who is already in the cell', () => {
        const board = [assignment(7, MORNING, SUN, GUARD), assignment(8, MORNING, SUN, SUPERVISOR)];
        expect(replaceInSlot(board, current, 8)).toBeNull();
    });
});

describe('moveToSlot', () => {
    const from = { employeeId: 7, shiftId: MORNING, date: SUN };

    it('moves the employee to the slot and its role, keeping custom hours', () => {
        const board = [assignment(7, MORNING, SUN, GUARD, { start_time: '07:00', end_time: '13:00' })];
        expect(moveToSlot(board, from, { shiftId: EVENING, date: MON, positionId: SUPERVISOR })).toEqual([
            assignment(7, EVENING, MON, SUPERVISOR, { start_time: '07:00', end_time: '13:00' }),
        ]);
    });

    it('only changes the role when the slot is in the same cell', () => {
        const board = [assignment(7, MORNING, SUN, GUARD)];
        expect(moveToSlot(board, from, { shiftId: MORNING, date: SUN, positionId: SUPERVISOR })).toEqual([
            assignment(7, MORNING, SUN, SUPERVISOR),
        ]);
    });

    it('refuses a move into a cell where the employee already is', () => {
        const board = [assignment(7, MORNING, SUN, GUARD), assignment(7, EVENING, SUN, GUARD)];
        expect(moveToSlot(board, from, { shiftId: EVENING, date: SUN, positionId: SUPERVISOR })).toBeNull();
    });
});

describe('swapPlacements', () => {
    const first = { employeeId: 7, shiftId: MORNING, date: SUN };
    const second = { employeeId: 8, shiftId: EVENING, date: MON };

    it('exchanges the employees; roles and hours stay with the slots', () => {
        const board = [
            assignment(7, MORNING, SUN, GUARD, { start_time: '07:00', end_time: '13:00' }),
            assignment(8, EVENING, MON, SUPERVISOR),
        ];
        expect(swapPlacements(board, first, second)).toEqual([
            assignment(8, MORNING, SUN, GUARD, { start_time: '07:00', end_time: '13:00' }),
            assignment(7, EVENING, MON, SUPERVISOR),
        ]);
    });

    it('allows a swap inside one cell', () => {
        const board = [assignment(7, MORNING, SUN, GUARD), assignment(8, MORNING, SUN, SUPERVISOR)];
        const sameCell = { employeeId: 8, shiftId: MORNING, date: SUN };
        expect(swapPlacements(board, first, sameCell)).toEqual([
            assignment(8, MORNING, SUN, GUARD),
            assignment(7, MORNING, SUN, SUPERVISOR),
        ]);
    });

    it("refuses when either employee is already in the other's cell", () => {
        const board = [
            assignment(7, MORNING, SUN, GUARD),
            assignment(8, EVENING, MON, SUPERVISOR),
            assignment(7, EVENING, MON, GUARD), // 7 already works Monday evening
        ];
        expect(swapPlacements(board, first, second)).toBeNull();
        expect(swapPlacements(board, second, first)).toBeNull();
    });
});

describe('removePlacement', () => {
    it("removes only that employee's place in that cell", () => {
        const board = [
            assignment(7, MORNING, SUN, GUARD),
            assignment(8, MORNING, SUN, SUPERVISOR),
            assignment(7, MORNING, MON, GUARD),
        ];
        expect(removePlacement(board, { employeeId: 7, shiftId: MORNING, date: SUN })).toEqual([
            assignment(8, MORNING, SUN, SUPERVISOR),
            assignment(7, MORNING, MON, GUARD),
        ]);
    });
});

describe('setPlacementHours', () => {
    it('sets the hours of that placement only', () => {
        const board = [assignment(7, MORNING, SUN, GUARD), assignment(8, MORNING, SUN, SUPERVISOR)];
        expect(setPlacementHours(board, { employeeId: 7, shiftId: MORNING, date: SUN }, '08:00', '14:00')).toEqual([
            assignment(7, MORNING, SUN, GUARD, { start_time: '08:00', end_time: '14:00' }),
            assignment(8, MORNING, SUN, SUPERVISOR),
        ]);
    });
});

describe('applyDrop', () => {
    const slot = (employeeId: number | null, shiftId = MORNING, date = SUN, positionId = GUARD) =>
        ({ shiftId, date, positionId, employeeId });
    const fromBoard = (employee_id: number, shift_id = MORNING, date = SUN, position_id = GUARD) =>
        ({ type: 'FROM_BOARD' as const, employee_id, shift_id, date, position_id });

    it('fills an empty slot from the sidebar', () => {
        expect(applyDrop([], { type: 'FROM_SIDEBAR', employee_id: 7 }, slot(null))).toEqual([
            assignment(7, MORNING, SUN, GUARD),
        ]);
    });

    it("replaces the slot's employee from the sidebar", () => {
        const board = [assignment(7, MORNING, SUN, GUARD)];
        expect(applyDrop(board, { type: 'FROM_SIDEBAR', employee_id: 8 }, slot(7))).toEqual([
            assignment(8, MORNING, SUN, GUARD),
        ]);
    });

    it('moves a board chip to an empty slot', () => {
        const board = [assignment(7, MORNING, SUN, GUARD)];
        expect(applyDrop(board, fromBoard(7), slot(null, EVENING, MON, SUPERVISOR))).toEqual([
            assignment(7, EVENING, MON, SUPERVISOR),
        ]);
    });

    it("swaps a board chip with the slot's employee", () => {
        const board = [assignment(7, MORNING, SUN, GUARD), assignment(8, EVENING, MON, SUPERVISOR)];
        expect(applyDrop(board, fromBoard(7), slot(8, EVENING, MON, SUPERVISOR))).toEqual([
            assignment(8, MORNING, SUN, GUARD),
            assignment(7, EVENING, MON, SUPERVISOR),
        ]);
    });

    it('leaves the board as it is for a chip dropped on itself', () => {
        const board = [assignment(7, MORNING, SUN, GUARD)];
        expect(applyDrop(board, fromBoard(7), slot(7))).toBe(board);
    });

    it('refuses to put an employee in a cell twice', () => {
        const board = [assignment(7, MORNING, SUN, GUARD), assignment(8, MORNING, SUN, SUPERVISOR)];
        expect(applyDrop(board, { type: 'FROM_SIDEBAR', employee_id: 8 }, slot(7))).toBeNull();
    });
});
