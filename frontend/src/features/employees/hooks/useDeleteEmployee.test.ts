import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { deleteEmployee } from '@/api/employees';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import { useDeleteEmployee } from './useDeleteEmployee';

vi.mock('@/api/employees', () => ({ deleteEmployee: vi.fn() }));

const renderDelete = () => {
    const { client, wrapper } = createQueryWrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    return { ...renderHook(() => useDeleteEmployee(), { wrapper }), invalidate };
};

describe('useDeleteEmployee', () => {
    it('marks the row while deleting, then refreshes the lists', async () => {
        let finish!: () => void;
        vi.mocked(deleteEmployee).mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const { result, invalidate } = renderDelete();

        let deleting!: Promise<void>;
        act(() => { deleting = result.current.remove(7); });
        await vi.waitFor(() => expect(result.current.deletingId).toBe(7));

        await act(async () => { finish(); await deleting; });

        await vi.waitFor(() => expect(result.current.deletingId).toBeNull());
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['employees'] });
        expect(notify.success).toHaveBeenCalledWith('העובד נמחק');
    });

    it('reports a failed delete', async () => {
        const error = new Error('offline');
        vi.mocked(deleteEmployee).mockRejectedValue(error);
        const { result, invalidate } = renderDelete();

        await act(() => result.current.remove(7));

        expect(notify.error).toHaveBeenCalledWith(error, 'מחיקת העובד נכשלה');
        expect(invalidate).not.toHaveBeenCalled();
    });
});
