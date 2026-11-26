import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

import { useAuth } from '@/context/useAuth';
import { createQueryWrapper } from '@/test/queryWrapper';
import { useDemo } from './useDemo';
import { useDemoStart } from './useDemoStart';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('./useDemo', () => ({ useDemo: vi.fn() }));
// Keeps the expected failures out of the test output
vi.mock('@/api/errors', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/errors')>()),
    logError: vi.fn(),
}));

const start = vi.fn<() => Promise<void>>();

const httpError = (status: number) => new AxiosError('failed', String(status), undefined, undefined, {
    status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: { detail: 'x' },
});

const setAuth = (auth: { isAuthenticated: boolean; isLoading: boolean }) => {
    vi.mocked(useAuth).mockReturnValue({ user: null, login: vi.fn(), logout: vi.fn(), ...auth });
};

const renderStart = () => {
    const { wrapper } = createQueryWrapper();
    return renderHook(() => useDemoStart(), { wrapper });
};

describe('useDemoStart', () => {
    beforeEach(() => {
        // clearAllMocks keeps implementations, so a failure set by one test would leak into the next
        vi.clearAllMocks();
        start.mockResolvedValue();
        vi.mocked(useDemo).mockReturnValue({
            isEnabled: true, sandboxTtlHours: 24, isStatusLoaded: true, start, switchRole: vi.fn(),
        });
        setAuth({ isAuthenticated: false, isLoading: false });
    });

    it('starts a sandbox once and opens the schedule', async () => {
        const { rerender } = renderStart();
        rerender();

        await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
        expect(start).toHaveBeenCalledTimes(1);
    });

    it('waits for the stored session to be read', async () => {
        setAuth({ isAuthenticated: false, isLoading: true });
        const { rerender } = renderStart();
        expect(start).not.toHaveBeenCalled();

        setAuth({ isAuthenticated: false, isLoading: false });
        rerender();

        await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    });

    it('reuses an existing session instead of creating another sandbox', () => {
        setAuth({ isAuthenticated: true, isLoading: false });

        renderStart();

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
        expect(start).not.toHaveBeenCalled();
    });

    it('explains a missing demo, and retries on request', async () => {
        start.mockRejectedValueOnce(httpError(404));
        const { result } = renderStart();

        await vi.waitFor(() => expect(result.current.error).toBe('סביבת ההדגמה אינה זמינה באתר זה.'));
        expect(navigate).not.toHaveBeenCalled();

        act(() => result.current.retry());

        await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
        expect(start).toHaveBeenCalledTimes(2);
        expect(result.current.error).toBeNull();
    });
});
