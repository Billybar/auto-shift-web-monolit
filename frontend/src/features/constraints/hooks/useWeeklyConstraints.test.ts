import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getEmployeeConstraints, syncEmployeeConstraints } from '@/api/constraints';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { WeeklyConstraint, WeeklyDataResponse } from '@/types';
import { useWeeklyConstraints } from './useWeeklyConstraints';

vi.mock('@/api/constraints', () => ({
    getEmployeeConstraints: vi.fn(),
    syncEmployeeConstraints: vi.fn(),
}));
vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const EMPLOYEE = 7;
const WEEK = '2026-11-29';
const WEEK_END = '2026-12-05';

const constraint = (groupId: number, shiftId: number, date: string): WeeklyConstraint => ({
    id: null, employee_id: EMPLOYEE, group_id: groupId, shift_id: shiftId, date, constraint_type: 'cannot_work',
});

const week = (overrides: Partial<WeeklyDataResponse> = {}): WeeklyDataResponse => ({
    // Row 10 holds shifts 1 and 2, so the API sends its mark twice
    constraints: [constraint(10, 1, WEEK), constraint(10, 2, WEEK)],
    note: 'late on Monday',
    uses_defaults: true,
    ...overrides,
});

const renderBoard = async () => {
    const { wrapper, client } = createQueryWrapper();
    const hook = renderHook(
        () => useWeeklyConstraints({ employeeId: EMPLOYEE, isManager: false, initialStartDate: WEEK }),
        { wrapper }
    );
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    return { ...hook, client };
};

describe('useWeeklyConstraints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getEmployeeConstraints).mockResolvedValue(week());
        vi.mocked(syncEmployeeConstraints).mockResolvedValue({ detail: 'ok', saved_constraints_count: 1 });
    });

    it('loads the week with one mark per board row and date', async () => {
        const { result } = await renderBoard();

        expect(getEmployeeConstraints).toHaveBeenCalledWith(EMPLOYEE, WEEK, WEEK_END);
        expect(result.current.constraintsList).toEqual([
            { employee_id: EMPLOYEE, group_id: 10, date: WEEK, constraint_type: 'cannot_work' },
        ]);
        expect(result.current.note).toBe('late on Monday');
        expect(result.current.usesDefaults).toBe(true);
        expect(result.current.isDirty).toBe(false);
    });

    it('keeps unsaved edits on screen when the week is fetched again', async () => {
        const { result } = await renderBoard();

        // cannot_work -> prefer_to
        act(() => result.current.toggleConstraint(WEEK, 10));
        expect(result.current.isDirty).toBe(true);

        vi.mocked(getEmployeeConstraints).mockResolvedValue(week({ constraints: [], note: null }));
        await act(() => result.current.reload());

        expect(result.current.constraintsList).toEqual([
            { employee_id: EMPLOYEE, group_id: 10, date: WEEK, constraint_type: 'prefer_to' },
        ]);
        expect(result.current.note).toBe('late on Monday');
    });

    it('saves the shown week, then shows it as saved', async () => {
        const { result } = await renderBoard();
        act(() => result.current.toggleConstraint('2026-11-30', 11));
        act(() => result.current.setNote('only mornings'));

        let saved = false;
        await act(async () => { saved = await result.current.saveConstraints(); });

        expect(saved).toBe(true);
        expect(syncEmployeeConstraints).toHaveBeenCalledWith(EMPLOYEE, WEEK, WEEK_END, {
            constraints: [
                { employee_id: EMPLOYEE, group_id: 10, date: WEEK, constraint_type: 'cannot_work' },
                { employee_id: EMPLOYEE, group_id: 11, date: '2026-11-30', constraint_type: 'cannot_work' },
            ],
            note: 'only mornings',
        });
        expect(result.current.isDirty).toBe(false);
        expect(result.current.usesDefaults).toBe(false);
        expect(result.current.constraintsList).toHaveLength(2);
        expect(result.current.note).toBe('only mornings');
        expect(notify.success).toHaveBeenCalledWith('האילוצים נשמרו');
    });

    it('keeps the edits and reports a failed save', async () => {
        const error = new Error('offline');
        vi.mocked(syncEmployeeConstraints).mockRejectedValue(error);
        const { result } = await renderBoard();
        act(() => result.current.toggleConstraint(WEEK, 10));

        let saved = true;
        await act(async () => { saved = await result.current.saveConstraints(); });

        expect(saved).toBe(false);
        expect(result.current.isDirty).toBe(true);
        expect(notify.error).toHaveBeenCalledWith(error, 'שמירת האילוצים נכשלה');
    });

    it('drops unsaved edits when moving to another week', async () => {
        const { result } = await renderBoard();
        act(() => result.current.toggleConstraint(WEEK, 10));

        act(() => result.current.setSyncStartDate('2026-12-06'));

        expect(result.current.isDirty).toBe(false);
        await waitFor(() => expect(getEmployeeConstraints).toHaveBeenCalledWith(EMPLOYEE, '2026-12-06', '2026-12-12'));
    });

    it('never saves a week that failed to load', async () => {
        vi.mocked(getEmployeeConstraints).mockRejectedValue(new Error('boom'));
        const { result } = await renderBoard();
        await waitFor(() => expect(result.current.loadError).not.toBeNull());
        expect(result.current.constraintsList).toEqual([]);

        let saved = true;
        await act(async () => { saved = await result.current.saveConstraints(); });

        expect(saved).toBe(false);
        expect(syncEmployeeConstraints).not.toHaveBeenCalled();
    });
});
