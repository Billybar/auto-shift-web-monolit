import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshToken } from '@/api/auth';
import { logError } from '@/api/errors';
import { networkError } from '@/test/apiErrors';
import { createQueryWrapper } from '@/test/queryWrapper';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';

vi.mock('@/api/auth', () => ({ refreshToken: vi.fn() }));

const DAY_S = 24 * 60 * 60;
const nowS = () => Math.floor(Date.now() / 1000);

interface Claims {
    sub?: string;
    role?: string;
    employee_id?: number;
    first_name?: string;
    last_name?: string;
    exp?: number;
    iat?: number;
}

/** An unsigned JWT: jwtDecode only reads the payload. Valid for 90 days and issued a minute ago by default. */
const fakeToken = (claims: Claims = {}) => {
    const encode = (part: object) => btoa(JSON.stringify(part)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const payload = {
        sub: 'dana@example.com', role: 'scheduler', employee_id: 7, first_name: 'Dana', last_name: 'Cohen',
        exp: nowS() + 90 * DAY_S, iat: nowS() - 60, ...claims,
    };
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
};
const dayOldToken = (claims: Claims = {}) => fakeToken({ iat: nowS() - 2 * DAY_S, ...claims });

const renderAuth = () => {
    const { client, wrapper: QueryWrapper } = createQueryWrapper();
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryWrapper><AuthProvider>{children}</AuthProvider></QueryWrapper>
    );
    return { client, ...renderHook(() => useAuth(), { wrapper }) };
};

const storedToken = () => localStorage.getItem('access_token');

describe('AuthProvider', () => {
    // What the refresh endpoint answers with
    let renewed: string;

    beforeEach(() => {
        localStorage.clear();
        renewed = fakeToken({ first_name: 'Renewed' });
        vi.mocked(refreshToken).mockResolvedValue({ access_token: renewed, token_type: 'bearer' });
    });

    describe('on load', () => {
        it('has no user without a stored token', () => {
            const { result } = renderAuth();

            expect(result.current).toMatchObject({ user: null, isAuthenticated: false, isLoading: false });
            expect(refreshToken).not.toHaveBeenCalled();
        });

        it("signs in the stored token's user", () => {
            localStorage.setItem('access_token', fakeToken());

            const { result } = renderAuth();

            expect(result.current.isAuthenticated).toBe(true);
            expect(result.current.user).toEqual({
                email: 'dana@example.com', first_name: 'Dana', last_name: 'Cohen', role: 'scheduler', employee_id: 7,
            });
        });

        it('drops an expired token', () => {
            localStorage.setItem('access_token', fakeToken({ exp: nowS() - 60, iat: nowS() - 91 * DAY_S }));

            const { result } = renderAuth();

            expect(result.current.user).toBeNull();
            expect(storedToken()).toBeNull();
            expect(refreshToken).not.toHaveBeenCalled();
        });

        it('drops and logs a token it cannot read', () => {
            localStorage.setItem('access_token', 'not-a-jwt');

            const { result } = renderAuth();

            expect(result.current.user).toBeNull();
            expect(storedToken()).toBeNull();
            expect(logError).toHaveBeenCalledWith('Failed to decode token on load:', expect.anything());
        });
    });

    describe('sliding session', () => {
        it('swaps a day-old token for a fresh one', async () => {
            localStorage.setItem('access_token', dayOldToken());

            const { result } = renderAuth();

            await waitFor(() => expect(result.current.user?.first_name).toBe('Renewed'));
            expect(refreshToken).toHaveBeenCalledOnce();
            expect(storedToken()).toBe(renewed);
        });

        it('leaves a token issued today alone', async () => {
            const token = fakeToken();
            localStorage.setItem('access_token', token);

            renderAuth();
            await act(async () => {});

            expect(refreshToken).not.toHaveBeenCalled();
            expect(storedToken()).toBe(token);
        });

        it('renews a token from before refresh support, which has no issue time', async () => {
            localStorage.setItem('access_token', fakeToken({ iat: undefined }));

            const { result } = renderAuth();

            await waitFor(() => expect(result.current.user?.first_name).toBe('Renewed'));
        });

        it('keeps the current token when the refresh fails', async () => {
            const token = dayOldToken();
            localStorage.setItem('access_token', token);
            vi.mocked(refreshToken).mockRejectedValue(networkError());

            const { result } = renderAuth();

            await waitFor(() => expect(logError).toHaveBeenCalledWith('Token refresh failed:', expect.anything()));
            expect(storedToken()).toBe(token);
            expect(result.current.user?.first_name).toBe('Dana');
        });

        it("doesn't sign back in when the user logs out during the refresh", async () => {
            localStorage.setItem('access_token', dayOldToken());
            let answer!: (value: { access_token: string; token_type: string }) => void;
            vi.mocked(refreshToken).mockReturnValue(new Promise(resolve => { answer = resolve; }));
            const { result } = renderAuth();

            act(() => result.current.logout());
            await act(async () => answer({ access_token: fakeToken(), token_type: 'bearer' }));

            expect(storedToken()).toBeNull();
            expect(result.current.user).toBeNull();
        });

        it('checks again when the tab comes back into view', async () => {
            localStorage.setItem('access_token', fakeToken());
            const { result } = renderAuth();
            await act(async () => {});
            expect(refreshToken).not.toHaveBeenCalled();

            // The tab stayed open in the background for two days
            localStorage.setItem('access_token', dayOldToken());
            act(() => { document.dispatchEvent(new Event('visibilitychange')); });

            await waitFor(() => expect(result.current.user?.first_name).toBe('Renewed'));
            expect(refreshToken).toHaveBeenCalledOnce();
        });
    });

    describe('login and logout', () => {
        // Data cached under the previous account, and the instance's demo status
        const fillCache = (client: ReturnType<typeof createQueryWrapper>['client']) => {
            client.setQueryData(['employees', 3], ['someone']);
            client.setQueryData(['demo', 'status'], { enabled: false });
        };

        it("stores the token, signs in its user, and drops the previous account's data", () => {
            const { result, client } = renderAuth();
            fillCache(client);
            const token = fakeToken({ sub: 'manager@example.com', role: 'manager' });

            act(() => result.current.login(token));

            expect(storedToken()).toBe(token);
            expect(result.current.user).toMatchObject({ email: 'manager@example.com', role: 'manager' });
            expect(client.getQueryData(['employees', 3])).toBeUndefined();
            expect(client.getQueryData(['demo', 'status'])).toEqual({ enabled: false });
        });

        it("removes the token and the account's data on logout", () => {
            localStorage.setItem('access_token', fakeToken());
            const { result, client } = renderAuth();
            fillCache(client);

            act(() => result.current.logout());

            expect(storedToken()).toBeNull();
            expect(result.current).toMatchObject({ user: null, isAuthenticated: false });
            expect(client.getQueryData(['employees', 3])).toBeUndefined();
            expect(client.getQueryData(['demo', 'status'])).toEqual({ enabled: false });
        });
    });
});
