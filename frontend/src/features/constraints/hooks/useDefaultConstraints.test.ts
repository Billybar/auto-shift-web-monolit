import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultConstraints, saveDefaultConstraints } from '@/api/constraints';
import { defaultConstraintsQuery, employeeConstraintsKey } from '@/api/queries';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { DefaultConstraint, DefaultConstraintsResponse } from '@/types';
import { useDefaultConstraints } from './useDefaultConstraints';
import { constraintBoardKey } from './useWeeklyConstraints';

vi.mock('@/api/constraints', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraints')>()),
    getDefaultConstraints: vi.fn(),
    saveDefaultConstraints: vi.fn(),
}));

const SUNDAY_MORNING: DefaultConstraint = { group_id: 1, day_of_week: 0, constraint_type: 'cannot_work' };
const SERVER: DefaultConstraintsResponse = { employee_id: 7, constraints: [SUNDAY_MORNING] };

const renderDefaults = async (employeeId: number | undefined, isManager = false) => {
    const { client, wrapper } = createQueryWrapper();
    const hook = renderHook(() => useDefaultConstraints({ employeeId, isManager }), { wrapper });
    if (employeeId) await waitFor(() => expect(hook.result.current.defaults).toEqual(SERVER.constraints));
    return { ...hook, client };
};

describe('useDefaultConstraints', () => {
    beforeEach(() => {
        vi.mocked(getDefaultConstraints).mockResolvedValue(SERVER);
    });

    it('fetches nothing without an employee, and has nothing to save', async () => {
        const { result } = await renderDefaults(undefined);

        expect(getDefaultConstraints).not.toHaveBeenCalled();
        expect(result.current.defaults).toEqual([]);
        await act(async () => expect(await result.current.saveDefaults()).toBe(false));
        expect(saveDefaultConstraints).not.toHaveBeenCalled();
    });

    it("loads the employee's default week", async () => {
        const { result } = await renderDefaults(7);

        expect(getDefaultConstraints).toHaveBeenCalledWith(7);
        expect(result.current.isLoading).toBe(false);
        expect(result.current.loadError).toBeNull();
    });

    it("moves a cell through an employee's marks", async () => {
        const { result } = await renderDefaults(7);

        act(() => result.current.toggleDefault(2, 3));
        expect(result.current.defaults).toContainEqual({ group_id: 3, day_of_week: 2, constraint_type: 'cannot_work' });

        act(() => result.current.toggleDefault(0, 1));
        expect(result.current.defaults).toContainEqual({ ...SUNDAY_MORNING, constraint_type: 'prefer_to' });

        act(() => result.current.toggleDefault(0, 1));
        expect(result.current.defaults).toEqual([{ group_id: 3, day_of_week: 2, constraint_type: 'cannot_work' }]);
    });

    it("adds must_work to a manager's marks", async () => {
        const { result } = await renderDefaults(7, true);

        act(() => result.current.toggleDefault(0, 1));
        act(() => result.current.toggleDefault(0, 1));

        expect(result.current.defaults).toEqual([{ ...SUNDAY_MORNING, constraint_type: 'must_work' }]);
    });

    it('saves the week, updates the cache and refreshes the weeks that show it', async () => {
        const { result, client } = await renderDefaults(7);
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        act(() => result.current.toggleDefault(2, 3));
        const draft = result.current.defaults;
        const saved: DefaultConstraintsResponse = { employee_id: 7, constraints: draft };
        vi.mocked(saveDefaultConstraints).mockResolvedValue(saved);

        let ok: boolean | undefined;
        await act(async () => { ok = await result.current.saveDefaults(); });

        expect(ok).toBe(true);
        expect(saveDefaultConstraints).toHaveBeenCalledWith(7, draft);
        expect(client.getQueryData(defaultConstraintsQuery(7).queryKey)).toEqual(saved);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: constraintBoardKey(7) });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: employeeConstraintsKey(7) });
        expect(notify.success).toHaveBeenCalledWith('האילוצים הקבועים נשמרו', 'כל שבוע שעוד לא נשמר יתחיל מהם');
        expect(result.current.defaults).toEqual(draft);
    });

    it('keeps the edits and reports a failed save', async () => {
        const error = apiError(500);
        vi.mocked(saveDefaultConstraints).mockRejectedValue(error);
        const { result } = await renderDefaults(7);
        act(() => result.current.toggleDefault(2, 3));
        const draft = result.current.defaults;

        let ok: boolean | undefined;
        await act(async () => { ok = await result.current.saveDefaults(); });

        expect(ok).toBe(false);
        expect(notify.error).toHaveBeenCalledWith(error, 'שמירת האילוצים הקבועים נכשלה');
        expect(result.current.defaults).toEqual(draft);
    });

    it('blocks edits and saving when the week failed to load', async () => {
        vi.mocked(getDefaultConstraints).mockRejectedValue(apiError(500));
        const { wrapper } = createQueryWrapper();
        const { result } = renderHook(() => useDefaultConstraints({ employeeId: 7, isManager: false }), { wrapper });
        await waitFor(() => expect(result.current.loadError).not.toBeNull());

        act(() => result.current.toggleDefault(2, 3));

        expect(result.current.defaults).toEqual([]);
        await act(async () => expect(await result.current.saveDefaults()).toBe(false));
        expect(saveDefaultConstraints).not.toHaveBeenCalled();
    });
});
