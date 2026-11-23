import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getWeeklyDemand, setShiftDemandOverride } from '../../../api/shiftDefinitions';
import { notify } from '../../../lib/notify';
import { createQueryWrapper } from '../../../test/queryWrapper';
import type { ShiftDayDemand } from '../../../types';
import { demandKey, useWeeklyDemand } from './useWeeklyDemand';

vi.mock('../../../api/shiftDefinitions', () => ({
    getWeeklyDemand: vi.fn(),
    setShiftDemandOverride: vi.fn(),
}));
vi.mock('../../../lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const WEEK = '2026-11-29';
const KEY = demandKey(1, WEEK, 3);
const cell = (required: number, isOverride = false): ShiftDayDemand => ({
    shift_id: 1, position_id: 3, date: WEEK, required_employees: required, is_override: isOverride,
});

const renderDemand = async () => {
    const { wrapper } = createQueryWrapper();
    const hook = renderHook(() => useWeeklyDemand(5, WEEK), { wrapper });
    await waitFor(() => expect(hook.result.current.demandMap[KEY]).toBeDefined());
    return hook;
};

describe('useWeeklyDemand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getWeeklyDemand).mockResolvedValue([cell(2)]);
    });

    it('keys the week by shift, date and role', async () => {
        const { result } = await renderDemand();
        expect(getWeeklyDemand).toHaveBeenCalledWith(5, WEEK);
        expect(result.current.demandMap[KEY].required_employees).toBe(2);
    });

    it('shows a change at once, locks the cell, then keeps the server answer', async () => {
        let answer!: (value: ShiftDayDemand) => void;
        vi.mocked(setShiftDemandOverride).mockReturnValue(new Promise(resolve => { answer = resolve; }));
        const { result } = await renderDemand();

        act(() => { void result.current.changeSlots(1, WEEK, 3, 1); });
        await waitFor(() => expect(result.current.demandMap[KEY].required_employees).toBe(3));
        expect(result.current.pendingCells.has(KEY)).toBe(true);
        expect(setShiftDemandOverride).toHaveBeenCalledWith(1, WEEK, 3, 3);

        await act(async () => { answer(cell(4, true)); });
        await waitFor(() => expect(result.current.pendingCells.has(KEY)).toBe(false));
        expect(result.current.demandMap[KEY]).toEqual(cell(4, true));
    });

    it('rolls a failed change back and reports it', async () => {
        const error = new Error('offline');
        vi.mocked(setShiftDemandOverride).mockRejectedValue(error);
        const { result } = await renderDemand();

        await act(() => result.current.changeSlots(1, WEEK, 3, -1));

        expect(result.current.demandMap[KEY]).toEqual(cell(2));
        expect(notify.error).toHaveBeenCalledWith(error, 'עדכון מספר העמדות נכשל');
    });

    it('reports a failed load instead of an empty week', async () => {
        vi.mocked(getWeeklyDemand).mockRejectedValue(new Error('boom'));
        const { wrapper } = createQueryWrapper();
        const { result } = renderHook(() => useWeeklyDemand(5, WEEK), { wrapper });

        await waitFor(() => expect(result.current.loadError).not.toBeNull());
        expect(result.current.isLoading).toBe(false);
        expect(result.current.demandMap).toEqual({});
    });

    it('fetches nothing without a location', () => {
        const { wrapper } = createQueryWrapper();
        const { result } = renderHook(() => useWeeklyDemand(null, WEEK), { wrapper });
        expect(result.current.isLoading).toBe(false);
        expect(getWeeklyDemand).not.toHaveBeenCalled();
    });
});
