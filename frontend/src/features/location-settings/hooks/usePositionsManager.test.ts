import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

import { createPosition, deletePosition, updatePosition } from '@/api/positions';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { Position } from '@/types';
import { usePositionsManager } from './usePositionsManager';

// queries.ts reads the module's list fetcher, so it stays real
vi.mock('@/api/positions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/positions')>()),
    createPosition: vi.fn(),
    deletePosition: vi.fn(),
    updatePosition: vi.fn(),
}));
vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// Keeps the expected failures out of the test output
vi.mock('@/api/errors', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/errors')>()),
    logError: vi.fn(),
}));

const LOCATION = 3;
const position = (id: number, sortOrder: number, name = `role ${id}`) =>
    ({ id, location_id: LOCATION, name, color: '94A3B8', sort_order: sortOrder, is_active: true }) as Position;
const GUARD = position(1, 0, 'מאבטח');
const SUPERVISOR = position(2, 1, 'אחמ"ש');

const codedError = (status: number, code: string) => new AxiosError('failed', String(status), undefined, undefined, {
    status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: { detail: 'x', code },
});

const renderManager = (positions = [GUARD, SUPERVISOR]) => {
    const { client, wrapper } = createQueryWrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    return { ...renderHook(() => usePositionsManager(LOCATION, positions), { wrapper }), invalidate };
};

describe('usePositionsManager', () => {
    beforeEach(() => {
        // clearAllMocks keeps implementations, so a failure set by one test would leak into the next
        vi.clearAllMocks();
        vi.mocked(createPosition).mockResolvedValue(GUARD);
        vi.mocked(updatePosition).mockResolvedValue(GUARD);
        vi.mocked(deletePosition).mockResolvedValue();
    });

    it('adds a role with a trimmed name and refreshes the roles', async () => {
        const { result, invalidate } = renderManager();

        let added = false;
        await act(async () => { added = await result.current.add('  נהג ', '112233'); });

        expect(added).toBe(true);
        expect(createPosition).toHaveBeenCalledWith({ location_id: LOCATION, name: 'נהג', color: '112233' });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['positions', LOCATION] });
        expect(notify.success).toHaveBeenCalledWith('התפקיד נוסף');
    });

    it('ignores a blank name', async () => {
        const { result } = renderManager();

        let added = true;
        await act(async () => { added = await result.current.add('  ', '112233'); });

        expect(added).toBe(false);
        expect(createPosition).not.toHaveBeenCalled();
    });

    it('renames a role from its draft, and drops the draft once saved', async () => {
        const { result } = renderManager();
        act(() => result.current.editName(GUARD.id, ' שומר '));
        expect(result.current.nameOf(GUARD.id, GUARD.name)).toBe(' שומר ');

        await act(() => result.current.rename(GUARD));

        expect(updatePosition).toHaveBeenCalledWith(GUARD.id, { name: 'שומר' });
        expect(result.current.nameOf(GUARD.id, GUARD.name)).toBe(GUARD.name);
    });

    it("doesn't send an unchanged or empty name", async () => {
        const { result } = renderManager();
        act(() => result.current.editName(GUARD.id, GUARD.name));
        await act(() => result.current.rename(GUARD));
        act(() => result.current.editName(SUPERVISOR.id, '   '));
        await act(() => result.current.rename(SUPERVISOR));

        expect(updatePosition).not.toHaveBeenCalled();
        expect(result.current.nameOf(SUPERVISOR.id, SUPERVISOR.name)).toBe(SUPERVISOR.name);
    });

    it('keeps the draft and shows the issue when a rename fails', async () => {
        vi.mocked(updatePosition).mockRejectedValue(codedError(409, 'position_name_taken'));
        const { result, invalidate } = renderManager();
        act(() => result.current.editName(GUARD.id, 'אחמ"ש'));

        await act(() => result.current.rename(GUARD));

        expect(result.current.nameOf(GUARD.id, GUARD.name)).toBe('אחמ"ש');
        expect(result.current.issue).toEqual({
            variant: 'error', title: 'שינוי שם התפקיד נכשל', message: 'כבר קיים באתר תפקיד בשם הזה. בחר שם אחר.',
        });
        expect(invalidate).not.toHaveBeenCalled();

        act(() => result.current.dismissIssue());
        expect(result.current.issue).toBeNull();
    });

    it('archives and restores a role with a toast', async () => {
        const { result } = renderManager();

        await act(() => result.current.setArchived(GUARD, true));
        expect(updatePosition).toHaveBeenLastCalledWith(GUARD.id, { is_active: false });
        expect(notify.success).toHaveBeenLastCalledWith('התפקיד הועבר לארכיון');

        await act(() => result.current.setArchived(GUARD, false));
        expect(updatePosition).toHaveBeenLastCalledWith(GUARD.id, { is_active: true });
        expect(notify.success).toHaveBeenLastCalledWith('התפקיד שוחזר');
    });

    it('marks the moved role as busy, saves the new order, and refreshes even when it fails', async () => {
        let fail!: (error: Error) => void;
        vi.mocked(updatePosition).mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
        const { result, invalidate } = renderManager();

        let moving!: Promise<void>;
        act(() => { moving = result.current.move(1, -1); });
        await vi.waitFor(() => expect(result.current.busyId).toBe(SUPERVISOR.id));
        expect(updatePosition).toHaveBeenCalledWith(SUPERVISOR.id, { sort_order: 0 });
        expect(updatePosition).toHaveBeenCalledWith(GUARD.id, { sort_order: 1 });

        await act(async () => { fail(new Error('offline')); await moving; });

        expect(result.current.issue?.title).toBe('שינוי סדר התפקידים נכשל');
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['positions', LOCATION] });
        await vi.waitFor(() => expect(result.current.busyId).toBeNull());
    });

    it('deletes a role and refreshes the roles, the employees and the demand template', async () => {
        const { result, invalidate } = renderManager();

        await act(() => result.current.remove(GUARD));

        expect(deletePosition).toHaveBeenCalledWith(GUARD.id);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['positions', LOCATION] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['employees'] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['demandTemplate', LOCATION] });
        expect(notify.success).toHaveBeenCalledWith('התפקיד נמחק');
    });

    it('offers to archive a role that is in use instead of deleting it', async () => {
        vi.mocked(deletePosition).mockRejectedValue(codedError(409, 'position_in_use'));
        const { result } = renderManager();

        await act(() => result.current.remove(GUARD));

        expect(result.current.issue).toMatchObject({ variant: 'warning', title: 'אי אפשר למחוק את התפקיד', archivePosition: GUARD });
    });
});
