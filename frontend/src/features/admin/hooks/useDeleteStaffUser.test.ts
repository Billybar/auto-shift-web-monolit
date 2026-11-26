import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteStaffUser } from '@/api/admin';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import { useDeleteStaffUser } from './useDeleteStaffUser';

// queries.ts reads the module's list fetchers, so they stay real
vi.mock('@/api/admin', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/admin')>()),
    deleteStaffUser: vi.fn(),
}));
vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const renderDelete = () => {
    const { client, wrapper } = createQueryWrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    return { ...renderHook(() => useDeleteStaffUser(), { wrapper }), invalidate };
};

describe('useDeleteStaffUser', () => {
    beforeEach(() => vi.clearAllMocks());

    it('marks the row while deleting, then refreshes the staff list', async () => {
        let finish!: () => void;
        vi.mocked(deleteStaffUser).mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const { result, invalidate } = renderDelete();

        let deleting!: Promise<void>;
        act(() => { deleting = result.current.remove(5); });
        await vi.waitFor(() => expect(result.current.deletingId).toBe(5));

        await act(async () => { finish(); await deleting; });

        await vi.waitFor(() => expect(result.current.deletingId).toBeNull());
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'staffUsers'] });
        expect(notify.success).toHaveBeenCalledWith('המשתמש נמחק');
    });

    it('reports a failed delete', async () => {
        const error = new Error('offline');
        vi.mocked(deleteStaffUser).mockRejectedValue(error);
        const { result, invalidate } = renderDelete();

        await act(() => result.current.remove(5));

        expect(notify.error).toHaveBeenCalledWith(error, 'מחיקת המשתמש נכשלה');
        expect(invalidate).not.toHaveBeenCalled();
    });
});
