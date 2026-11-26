import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getLocationWeights, updateLocationWeights } from '@/api/locations';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { LocationWeights } from '@/types';
import { useLocationWeights } from './useLocationWeights';

vi.mock('@/api/locations', () => ({ getLocationWeights: vi.fn(), updateLocationWeights: vi.fn() }));

const WEIGHTS = { rest_gap: 10, prefer_to: 5 } as LocationWeights;

const renderWeights = async (enabled = true) => {
    const { wrapper } = createQueryWrapper();
    const hook = renderHook(() => useLocationWeights(5, enabled), { wrapper });
    if (enabled) await waitFor(() => expect(hook.result.current.weights).toEqual(WEIGHTS));
    return hook;
};

describe('useLocationWeights', () => {
    beforeEach(() => {
        vi.mocked(getLocationWeights).mockResolvedValue(WEIGHTS);
    });

    it('fetches nothing for an employee, and has nothing to open', async () => {
        const { result } = await renderWeights(false);
        expect(getLocationWeights).not.toHaveBeenCalled();
        act(() => result.current.open());
        expect(result.current.editing).toBeNull();
    });

    it('edits a copy, which Cancel drops', async () => {
        const { result } = await renderWeights();
        act(() => result.current.open());
        act(() => result.current.setEditing({ ...WEIGHTS, rest_gap: 20 }));

        act(() => result.current.close());

        expect(result.current.editing).toBeNull();
        expect(result.current.weights).toEqual(WEIGHTS);
    });

    it('saves the edits and closes', async () => {
        const saved = { ...WEIGHTS, rest_gap: 20 };
        vi.mocked(updateLocationWeights).mockResolvedValue(saved);
        const { result } = await renderWeights();
        act(() => result.current.open());
        act(() => result.current.setEditing(saved));

        await act(() => result.current.save());

        expect(updateLocationWeights).toHaveBeenCalledWith(5, saved);
        expect(result.current.editing).toBeNull();
        expect(result.current.weights).toEqual(saved);
        expect(notify.success).toHaveBeenCalledWith('משקלי השיבוץ נשמרו');
    });

    it('stays open with the reason when the save fails', async () => {
        vi.mocked(updateLocationWeights).mockRejectedValue(new Error('offline'));
        const { result } = await renderWeights();
        act(() => result.current.open());

        await act(() => result.current.save());

        expect(result.current.editing).toEqual(WEIGHTS);
        expect(result.current.saveError).not.toBeNull();
    });
});
