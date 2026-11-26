import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAssignments, saveAssignments } from '@/api/assignments';
import { getEmployeesByLocation } from '@/api/employees';
import { getPositions } from '@/api/positions';
import { getShiftDefinitions } from '@/api/shiftDefinitions';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { Assignment, Employee } from '@/types';
import { useScheduleBoard } from './useScheduleBoard';

vi.mock('@/api/assignments', () => ({ getAssignments: vi.fn(), saveAssignments: vi.fn() }));
vi.mock('@/api/employees', () => ({ getEmployeesByLocation: vi.fn() }));
vi.mock('@/api/positions', () => ({ getPositions: vi.fn() }));
vi.mock('@/api/shiftDefinitions', () => ({ getShiftDefinitions: vi.fn() }));

const LOCATION = 5;
const MORNING = 1;
const GUARD = 3;
const WEEK = { startDate: '2026-11-29', endDate: '2026-12-05', previousDayStr: '2026-11-28' };
const NEXT_WEEK = { startDate: '2026-12-06', endDate: '2026-12-12', previousDayStr: '2026-12-05' };
const SUN = WEEK.startDate;

const assignment = (employee_id: number, date = SUN): Assignment =>
    ({ employee_id, shift_id: MORNING, date, position_id: GUARD });
const employee = (id: number) => ({ id, position_ids: [GUARD] }) as unknown as Employee;
const emptySlot = { shiftId: MORNING, date: SUN, positionId: GUARD, employeeId: null };

const SATURDAY = [assignment(9, WEEK.previousDayStr)];

const renderBoard = async (isEmployee = false) => {
    const { wrapper, client } = createQueryWrapper();
    const hook = renderHook(({ week }) => useScheduleBoard(LOCATION, week, isEmployee), {
        wrapper,
        initialProps: { week: WEEK },
    });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    return { ...hook, client };
};

describe('useScheduleBoard', () => {
    beforeEach(() => {
        vi.mocked(getShiftDefinitions).mockResolvedValue([]);
        vi.mocked(getPositions).mockResolvedValue([]);
        vi.mocked(getEmployeesByLocation).mockResolvedValue([employee(7), employee(8)]);
        vi.mocked(getAssignments).mockImplementation(async (_loc, start) => {
            if (start === WEEK.previousDayStr) return SATURDAY;
            return start === SUN ? [assignment(7)] : [];
        });
        vi.mocked(saveAssignments).mockResolvedValue({ added: 1, updated: 0, removed: 0, unchanged: 1 });
    });

    it("loads the week, the Saturday before it, and the location's employees", async () => {
        const { result } = await renderBoard();

        expect(getAssignments).toHaveBeenCalledWith(LOCATION, SUN, WEEK.endDate);
        expect(getPositions).toHaveBeenCalledWith(LOCATION, true);
        expect(result.current.assignments).toEqual([assignment(7)]);
        expect(result.current.employeesMap[8]).toEqual(employee(8));
        await waitFor(() => expect(result.current.previousDayAssignments).toEqual(SATURDAY));
    });

    it('never fetches the Saturday for an employee', async () => {
        await renderBoard(true);
        expect(getAssignments).toHaveBeenCalledTimes(1);
    });

    it('shows a failed Saturday as not loaded, without blocking the board', async () => {
        vi.mocked(getAssignments).mockImplementation(async (_loc, start) => {
            if (start === WEEK.previousDayStr) throw new Error('boom');
            return [assignment(7)];
        });
        const { result } = await renderBoard();

        await waitFor(() => expect(result.current.previousDayAssignments).toBeNull());
        expect(result.current.loadError).toBeNull();
    });

    it('reports a failed week, so the page never shows (or saves) an empty board', async () => {
        vi.mocked(getAssignments).mockRejectedValue(new Error('boom'));
        const { result } = await renderBoard();
        expect(result.current.loadError).not.toBeNull();
        expect(result.current.assignments).toEqual([]);
    });

    it('applies drops, refuses a second place in a cell, and keeps edits over a refetch', async () => {
        const { result } = await renderBoard();

        let accepted = false;
        act(() => { accepted = result.current.drop({ type: 'FROM_SIDEBAR', employee_id: 8 }, emptySlot); });
        expect(accepted).toBe(true);
        act(() => { accepted = result.current.drop({ type: 'FROM_SIDEBAR', employee_id: 8 }, { ...emptySlot, employeeId: 7 }); });
        expect(accepted).toBe(false);

        act(() => result.current.setHours({ employeeId: 7, shiftId: MORNING, date: SUN }, '08:00', '14:00'));
        act(() => result.current.reload());
        await waitFor(() => expect(getAssignments).toHaveBeenCalledTimes(4));

        expect(result.current.assignments).toEqual([
            { ...assignment(7), start_time: '08:00', end_time: '14:00' },
            assignment(8),
        ]);
    });

    it('saves the board as shown, then shows it as saved', async () => {
        const { result, client } = await renderBoard();
        act(() => result.current.remove({ employeeId: 7, shiftId: MORNING, date: SUN }));

        await act(() => result.current.save());

        expect(saveAssignments).toHaveBeenCalledWith(LOCATION, SUN, WEEK.endDate, []);
        expect(client.getQueryData(['assignments', LOCATION, SUN, WEEK.endDate])).toEqual([]);
        expect(result.current.assignments).toEqual([]);
    });

    it('keeps the edits when a save fails', async () => {
        vi.mocked(saveAssignments).mockRejectedValue(new Error('offline'));
        const { result } = await renderBoard();
        act(() => result.current.remove({ employeeId: 7, shiftId: MORNING, date: SUN }));

        await act(() => expect(result.current.save()).rejects.toThrow('offline'));

        expect(result.current.assignments).toEqual([]);
    });

    it('drops the edits on a week change, and never shows them again', async () => {
        const { result, rerender } = await renderBoard();
        act(() => result.current.remove({ employeeId: 7, shiftId: MORNING, date: SUN }));

        rerender({ week: NEXT_WEEK });
        await waitFor(() => expect(getAssignments).toHaveBeenCalledWith(LOCATION, NEXT_WEEK.startDate, NEXT_WEEK.endDate));
        rerender({ week: WEEK });

        await waitFor(() => expect(result.current.assignments).toEqual([assignment(7)]));
    });

    it("ignores a draft meant for a week that's no longer shown", async () => {
        const { result, rerender } = await renderBoard();
        rerender({ week: NEXT_WEEK });
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        act(() => result.current.replaceAll([assignment(8)], `${LOCATION}|${SUN}`));

        expect(result.current.assignments).toEqual([]);
    });
});
