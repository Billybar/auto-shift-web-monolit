import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAllowedLocations } from '../api/locations';
import { createQueryClient } from '../api/query';
import { notify } from '../lib/notify';
import { createQueryWrapper } from '../test/queryWrapper';
import { UserRole } from '../types';
import type { LocationData, User } from '../types';
import { LocationProvider } from './LocationContext';
import { useAppLocation } from './useAppLocation';
import { useAuth } from './useAuth';

vi.mock('../api/locations', () => ({ getAllowedLocations: vi.fn() }));
vi.mock('./useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const SCHEDULER: User = { email: 'scheduler@example.com', first_name: 'A', last_name: 'B', role: UserRole.SCHEDULER, employee_id: 0 };
const location = (id: number): LocationData => ({ id, name: `Site ${id}`, client_id: 1 });

const signIn = (user: User | null) => {
    vi.mocked(useAuth).mockReturnValue({
        user, isAuthenticated: !!user, isLoading: false, login: vi.fn(), logout: vi.fn(),
    });
};

// The app's own client, so a failed load goes through its error toast
const renderLocations = () => {
    const { wrapper: QueryWrapper } = createQueryWrapper(createQueryClient());
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryWrapper><LocationProvider>{children}</LocationProvider></QueryWrapper>
    );
    return renderHook(() => useAppLocation(), { wrapper });
};

describe('LocationProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        signIn(SCHEDULER);
        vi.mocked(getAllowedLocations).mockResolvedValue([location(10), location(11)]);
    });

    it("selects the first of the user's locations once they load", async () => {
        const { result } = renderLocations();
        expect(result.current.isLoadingLocations).toBe(true);

        await waitFor(() => expect(result.current.selectedLocationId).toBe(10));
        expect(result.current.isLoadingLocations).toBe(false);
        expect(getAllowedLocations).toHaveBeenCalledWith(UserRole.SCHEDULER);
    });

    it("keeps the user's pick while they can still reach it", async () => {
        const { result } = renderLocations();
        await waitFor(() => expect(result.current.availableLocations).toHaveLength(2));

        act(() => result.current.setSelectedLocationId(11));
        expect(result.current.selectedLocationId).toBe(11);

        vi.mocked(getAllowedLocations).mockResolvedValue([location(10)]);
        act(() => result.current.reloadLocations());
        await waitFor(() => expect(result.current.availableLocations).toHaveLength(1));
        expect(result.current.selectedLocationId).toBe(10);
    });

    it('has no locations, and asks for none, while logged out', () => {
        signIn(null);
        const { result } = renderLocations();

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
