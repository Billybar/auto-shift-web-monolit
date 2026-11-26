import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createClient, createLocation, createOrganization } from '@/api/admin';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { createQueryWrapper } from '@/test/queryWrapper';
import { useAddToHierarchy } from './useAddToHierarchy';

// queries.ts reads the module's list fetchers, so they stay real
vi.mock('@/api/admin', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/admin')>()),
    createClient: vi.fn(),
    createLocation: vi.fn(),
    createOrganization: vi.fn(),
}));

const renderAdd = () => {
    const { client, wrapper } = createQueryWrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    return { ...renderHook(() => useAddToHierarchy(), { wrapper }), invalidate };
};

describe('useAddToHierarchy', () => {
    beforeEach(() => {
        vi.mocked(createOrganization).mockResolvedValue({ id: 1, name: 'Acme' });
        vi.mocked(createClient).mockResolvedValue({ id: 2, name: 'Client', organization_id: 1 });
        vi.mocked(createLocation).mockResolvedValue({ id: 3, name: 'Site', client_id: 2 });
    });

    it('adds an organization with a trimmed name and refreshes the organizations', async () => {
        const { result, invalidate } = renderAdd();

        let added = false;
        await act(async () => { added = await result.current.add({ kind: 'organization' }, '  Acme  '); });

        expect(added).toBe(true);
        expect(createOrganization).toHaveBeenCalledWith({ name: 'Acme' });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'organizations'] });
        expect(notify.success).toHaveBeenCalledWith('הארגון נוסף');
    });

    it('adds a client under its organization', async () => {
        const { result, invalidate } = renderAdd();

        await act(() => result.current.add({ kind: 'client', organizationId: 4 }, 'Client'));

        expect(createClient).toHaveBeenCalledWith({ name: 'Client', organization_id: 4 });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'clients'] });
    });

    it("adds a location and refreshes the header's location list too", async () => {
        const { result, invalidate } = renderAdd();

        await act(() => result.current.add({ kind: 'location', clientId: 9 }, 'Site'));

        expect(createLocation).toHaveBeenCalledWith({ name: 'Site', client_id: 9 });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'locations'] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['locations', 'allowed'] });
        expect(notify.success).toHaveBeenCalledWith('האתר נוסף');
    });

    it('ignores a blank name', async () => {
        const { result } = renderAdd();

        let added = true;
        await act(async () => { added = await result.current.add({ kind: 'organization' }, '   '); });

        expect(added).toBe(false);
        expect(createOrganization).not.toHaveBeenCalled();
    });

    it('explains a duplicate organization name, and clears the error on reset', async () => {
        vi.mocked(createOrganization).mockRejectedValue(apiError(400));
        const { result, invalidate } = renderAdd();

        let added = true;
        await act(async () => { added = await result.current.add({ kind: 'organization' }, 'Acme'); });

        expect(added).toBe(false);
        // The mutation's error state lands on a later tick
        await vi.waitFor(() => expect(result.current.error).toBe('כבר קיים ארגון בשם הזה. בחר שם אחר.'));
        expect(invalidate).not.toHaveBeenCalled();

        act(() => result.current.resetError());
        await vi.waitFor(() => expect(result.current.error).toBeNull());
    });

    it("keeps the generic message for a client's 400", async () => {
        vi.mocked(createClient).mockRejectedValue(apiError(400));
        const { result } = renderAdd();

        await act(() => result.current.add({ kind: 'client', organizationId: 4 }, 'Client'));

        await vi.waitFor(() => expect(result.current.error).toBe('חלק מהנתונים שנשלחו אינם תקינים. בדוק את הפרטים ונסה שוב.'));
    });
});
