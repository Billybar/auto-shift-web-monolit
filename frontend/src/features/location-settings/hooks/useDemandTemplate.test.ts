import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDemandTemplate, updateDemandTemplate } from '@/api/locations';
import { getShiftDefinitions } from '@/api/shiftDefinitions';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { DemandTemplate } from '@/types';
import { templateKey, useDemandTemplate } from './useDemandTemplate';

vi.mock('@/api/locations', () => ({
    getDemandTemplate: vi.fn(),
    updateDemandTemplate: vi.fn(),
}));
vi.mock('@/api/shiftDefinitions', () => ({ getShiftDefinitions: vi.fn() }));

const SUNDAY_GUARD = templateKey(1, 3, 0);
const MONDAY_GUARD = templateKey(1, 3, 1);

const template = (locationId: number, cells: DemandTemplate['cells']): DemandTemplate => ({ location_id: locationId, cells });

const renderTemplate = async (initialLocationId = 5) => {
    const { wrapper } = createQueryWrapper();
    const hook = renderHook(({ locationId }) => useDemandTemplate(locationId), {
        wrapper,
        initialProps: { locationId: initialLocationId },
    });
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    return hook;
};

describe('useDemandTemplate', () => {
    beforeEach(() => {
        vi.mocked(getShiftDefinitions).mockResolvedValue([]);
        vi.mocked(getDemandTemplate).mockImplementation(async (locationId) => locationId === 5
            ? template(5, [
                { shift_id: 1, position_id: 3, day_of_week: 0, required_employees: 2 },
                // Role 4 was archived since
                { shift_id: 1, position_id: 4, day_of_week: 0, required_employees: 1 },
            ])
            : template(locationId, []));
    });

    it('steps a cell within its bounds, and discards back to the saved template', async () => {
        const { result } = await renderTemplate();
        expect(result.current.getValue(SUNDAY_GUARD)).toBe(2);

        act(() => { result.current.step(MONDAY_GUARD, 1); });
        expect(result.current.getValue(MONDAY_GUARD)).toBe(1);
        expect(result.current.isDirty).toBe(true);

        let moved = true;
        act(() => { moved = result.current.step(templateKey(2, 3, 0), -1); });
        expect(moved).toBe(false);

        act(() => result.current.discard());
        expect(result.current.getValue(MONDAY_GUARD)).toBe(0);
        expect(result.current.isDirty).toBe(false);
    });

    it('saves the cells above 0 of active roles, then shows the saved template', async () => {
        const saved = template(5, [
            { shift_id: 1, position_id: 3, day_of_week: 0, required_employees: 2 },
            { shift_id: 1, position_id: 3, day_of_week: 1, required_employees: 1 },
        ]);
        vi.mocked(updateDemandTemplate).mockResolvedValue(saved);
        const { result } = await renderTemplate();
        act(() => { result.current.step(MONDAY_GUARD, 1); });

        let ok = false;
        await act(async () => { ok = await result.current.save([3]); });

        expect(ok).toBe(true);
        expect(updateDemandTemplate).toHaveBeenCalledWith(5, saved.cells);
        expect(notify.success).toHaveBeenCalledWith('התקן השבועי נשמר');
        expect(result.current.isDirty).toBe(false);
        expect(result.current.getValue(MONDAY_GUARD)).toBe(1);
        expect(result.current.getValue(templateKey(1, 4, 0))).toBe(0);
    });

    it('keeps the edits and says why a save failed, until they are discarded', async () => {
        vi.mocked(updateDemandTemplate).mockRejectedValue(new Error('offline'));
        const { result } = await renderTemplate();
        act(() => { result.current.step(MONDAY_GUARD, 1); });

        let ok = true;
        await act(async () => { ok = await result.current.save([3]); });

        expect(ok).toBe(false);
        expect(result.current.isDirty).toBe(true);
        // The mutation's error state lands on a later tick
        await waitFor(() => expect(result.current.saveError).toBe('אירעה שגיאה לא צפויה. נסה שוב.'));
        expect(notify.success).not.toHaveBeenCalled();

        act(() => result.current.discard());
        await waitFor(() => expect(result.current.saveError).toBeNull());
        expect(result.current.isDirty).toBe(false);
    });

    it("never shows one location's edits on another", async () => {
        const { result, rerender } = await renderTemplate();
        act(() => { result.current.step(MONDAY_GUARD, 1); });

        rerender({ locationId: 6 });
        await waitFor(() => expect(getDemandTemplate).toHaveBeenCalledWith(6));
        await waitFor(() => expect(result.current.getValue(SUNDAY_GUARD)).toBe(0));

        expect(result.current.getValue(MONDAY_GUARD)).toBe(0);
        expect(result.current.isDirty).toBe(false);
    });
});
