import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAllLocations, getClients, getOrganizations } from '@/api/admin';
import { apiError } from '@/test/apiErrors';
import { testLocation } from '@/test/fixtures';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { Client, Organization } from '@/types';
import { useAdminData } from './useAdminData';

vi.mock('@/api/admin', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/admin')>()),
    getOrganizations: vi.fn(),
    getClients: vi.fn(),
    getAllLocations: vi.fn(),
}));

const ORGANIZATIONS = [{ id: 1, name: 'ארגון' }] as Organization[];
const CLIENTS = [{ id: 1, name: 'לקוח', organization_id: 1 }] as Client[];
const LOCATIONS = [testLocation(1), testLocation(2)];

const renderAdminData = () => {
    const { wrapper } = createQueryWrapper();
    return renderHook(() => useAdminData(), { wrapper });
};

describe('useAdminData', () => {
    beforeEach(() => {
        vi.mocked(getOrganizations).mockResolvedValue(ORGANIZATIONS);
        vi.mocked(getClients).mockResolvedValue(CLIENTS);
        vi.mocked(getAllLocations).mockResolvedValue(LOCATIONS);
    });

    it('gives the organizations, clients and locations', async () => {
        const { result } = renderAdminData();

        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current).toMatchObject({
            organizations: ORGANIZATIONS,
            clients: CLIENTS,
            locations: LOCATIONS,
            loadError: null,
        });
    });

    it.each([
        ['organizations', getOrganizations],
        ['clients', getClients],
        ['locations', getAllLocations],
    ] as const)('reports a failed load of the %s', async (_name, fetcher) => {
        vi.mocked(fetcher).mockRejectedValue(apiError(500));
        const { result } = renderAdminData();

        await waitFor(() => expect(result.current.loadError).not.toBeNull());
    });

    it('reloads all three lists', async () => {
        const { result } = renderAdminData();
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(() => result.current.reload());

        expect(getOrganizations).toHaveBeenCalledTimes(2);
        expect(getClients).toHaveBeenCalledTimes(2);
        expect(getAllLocations).toHaveBeenCalledTimes(2);
    });
});
