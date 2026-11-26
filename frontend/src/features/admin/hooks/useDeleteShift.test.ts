import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteShiftDefinition } from '@/api/shiftDefinitions';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import { useDeleteShift } from './useDeleteShift';

vi.mock('@/api/shiftDefinitions', () => ({ deleteShiftDefinition: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const LOCATION = 3;

const renderDelete = () => {
    const { client, wrapper } = createQueryWrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    return { ...renderHook(() => useDeleteShift(LOCATION), { wrapper }), invalidate };
};

describe('useDeleteShift', () => {
    beforeEach(() => vi.clearAllMocks());

    it('marks the row while deleting, then refreshes what the shifts feed', async () => {
        let finish!: () => void;
        vi.mocked(deleteShiftDefinition).mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const { result, invalidate } = renderDelete();

        let deleting!: Promise<boolean>;
        act(() => { deleting = result.current.remove(12); });
        await vi.waitFor(() => expect(result.current.deletingId).toBe(12));

        let deleted = false;
        await act(async () => { finish(); deleted = await deleting; });

        expect(deleted).toBe(true);
        await vi.waitFor(() => expect(result.current.deletingId).toBeNull());
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['shiftDefinitions', LOCATION] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['constraintGroups', LOCATION] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['demandTemplate', LOCATION] });
        expect(notify.success).toHaveBeenCalledWith('המשמרת נמחקה');
    });

    it('reports a failed delete', async () => {
        const error = new Error('in use');
        vi.mocked(deleteShiftDefinition).mockRejectedValue(error);
        const { result, invalidate } = renderDelete();

        let deleted = true;
        await act(async () => { deleted = await result.current.remove(12); });

        expect(deleted).toBe(false);
        expect(notify.error).toHaveBeenCalledWith(error, 'מחיקת המשמרת נכשלה');
        expect(invalidate).not.toHaveBeenCalled();
    });
});
