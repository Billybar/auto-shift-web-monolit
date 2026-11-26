import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

import { loginUser } from '@/api/auth';
import { useAuth } from '@/context/useAuth';
import { createQueryWrapper } from '@/test/queryWrapper';
import { useLogin } from './useLogin';

vi.mock('@/api/auth', () => ({ loginUser: vi.fn() }));
vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
// Keeps the expected failures out of the test output
vi.mock('@/api/errors', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/errors')>()),
    logError: vi.fn(),
}));

const login = vi.fn();

const httpError = (status: number) => new AxiosError('failed', String(status), undefined, undefined, {
    status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: { detail: 'x' },
});
const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');

const renderLogin = () => {
    const { wrapper } = createQueryWrapper();
    return renderHook(() => useLogin(), { wrapper });
};

describe('useLogin', () => {
    beforeEach(() => {
        // clearAllMocks keeps implementations, so a failure set by one test would leak into the next
        vi.clearAllMocks();
        vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false, isLoading: false, login, logout: vi.fn() });
        vi.mocked(loginUser).mockResolvedValue({ access_token: 'token-1', token_type: 'bearer' });
    });

    it('signs in and stores the session', async () => {
        const { result } = renderLogin();

        let signedIn = false;
        await act(async () => { signedIn = await result.current.submit('dana@example.com', 'secret'); });

        expect(signedIn).toBe(true);
        expect(loginUser).toHaveBeenCalledWith('dana@example.com', 'secret');
        expect(login).toHaveBeenCalledWith('token-1');
        expect(result.current.error).toBeNull();
    });

    it('asks for both fields before sending', async () => {
        const { result } = renderLogin();

        let signedIn = true;
        await act(async () => { signedIn = await result.current.submit('dana@example.com', '  '); });

        expect(signedIn).toBe(false);
        expect(result.current.error).toBe('יש להזין אימייל וסיסמא.');
        expect(loginUser).not.toHaveBeenCalled();
    });

    it('says the credentials are wrong on a 401', async () => {
        vi.mocked(loginUser).mockRejectedValue(httpError(401));
        const { result } = renderLogin();

        let signedIn = true;
        await act(async () => { signedIn = await result.current.submit('dana@example.com', 'wrong'); });

        expect(signedIn).toBe(false);
        // The mutation's error state lands on a later tick
        await vi.waitFor(() => expect(result.current.error).toBe('אימייל או סיסמה אינם נכונים.'));
        expect(login).not.toHaveBeenCalled();
    });

    it("doesn't blame the password for a network problem", async () => {
        vi.mocked(loginUser).mockRejectedValue(networkError());
        const { result } = renderLogin();

        await act(() => result.current.submit('dana@example.com', 'secret'));

        await vi.waitFor(() => expect(result.current.error).toBe('לא ניתן להתחבר לשרת. בדוק את החיבור לאינטרנט ונסה שוב.'));
    });
});
