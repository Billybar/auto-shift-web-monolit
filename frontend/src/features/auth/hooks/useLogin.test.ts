import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loginUser } from '@/api/auth';
import { apiError, networkError } from '@/test/apiErrors';
import { createProvidersWrapper } from '@/test/renderWithProviders';
import { useLogin } from './useLogin';

vi.mock('@/api/auth', () => ({ loginUser: vi.fn() }));

// Signed out, with a fake AuthContext whose login() the tests check
const renderLogin = () => {
    const { wrapper, auth } = createProvidersWrapper({ user: null });
    return { ...renderHook(() => useLogin(), { wrapper }), login: auth.login };
};

describe('useLogin', () => {
    beforeEach(() => {
        vi.mocked(loginUser).mockResolvedValue({ access_token: 'token-1', token_type: 'bearer' });
    });

    it('signs in and stores the session', async () => {
        const { result, login } = renderLogin();

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
        vi.mocked(loginUser).mockRejectedValue(apiError(401));
        const { result, login } = renderLogin();

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
