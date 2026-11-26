import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAllowedLocations } from '@/api/locations';
import { allowedLocationsKey } from '@/api/queries';
import { createQueryClient } from '@/api/query';
import { notify } from '@/lib/notify';
import { testLocation, testUser } from '@/test/fixtures';
import { createProvidersWrapper } from '@/test/renderWithProviders';
import { UserRole } from '@/types';
import type { User } from '@/types';
import { LocationProvider } from './LocationContext';
import { useAppLocation } from './useAppLocation';

vi.mock('@/api/locations', () => ({ getAllowedLocations: vi.fn() }));

// The real LocationProvider under the fake auth (it replaces the wrapper's fake location),
// with the app's own query client, so a failed load goes through its error toast
const renderLocations = (user: User | null = testUser(UserRole.SCHEDULER)) => {
    const { client, wrapper: Providers } = createProvidersWrapper({ user, client: createQueryClient() });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <Providers><LocationProvider>{children}</LocationProvider></Providers>
    );
    return { client, ...renderHook(() => useAppLocation(), { wrapper }) };
};

describe('LocationProvider', () => {
    beforeEach(() => {
        vi.mocked(getAllowedLocations).mockResolvedValue([testLocation(10), testLocation(11)]);
    });

    it("selects the first of the user's locations once they load", async () => {
        const { result } = renderLocations();
        expect(result.current.isLoadingLocations).toBe(true);

        await waitFor(() => expect(result.current.selectedLocationId).toBe(10));
        expect(result.current.isLoadingLocations).toBe(false);
        expect(getAllowedLocations).toHaveBeenCalledWith(UserRole.SCHEDULER);
    });

    it("keeps the user's pick while they can still reach it", async () => {
        const { result, client } = renderLocations();
        await waitFor(() => expect(result.current.availableLocations).toHaveLength(2));

        act(() => result.current.setSelectedLocationId(11));
        expect(result.current.selectedLocationId).toBe(11);

        vi.mocked(getAllowedLocations).mockResolvedValue([testLocation(10)]);
        // What the admin dashboard does after adding a location
        act(() => { void client.invalidateQueries({ queryKey: allowedLocationsKey }); });
        await waitFor(() => expect(result.current.availableLocations).toHaveLength(1));
        expect(result.current.selectedLocationId).toBe(10);
    });

    it('has no locations, and asks for none, while logged out', () => {
        const { result } = renderLocations(null);

        expect(result.current.availableLocations).toEqual([]);
        expect(result.current.selectedLocationId).toBe('');
        expect(result.current.isLoadingLocations).toBe(false);
        expect(getAllowedLocations).not.toHaveBeenCalled();
    });

    it('reports a failed load with a toast', async () => {
        const error = new Error('boom');
        vi.mocked(getAllowedLocations).mockRejectedValue(error);
        renderLocations();

        await waitFor(() => expect(notify.error).toHaveBeenCalledWith(error, 'טעינת רשימת האתרים נכשלה'));
    });
});
