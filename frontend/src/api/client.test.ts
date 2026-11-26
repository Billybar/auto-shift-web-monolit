import { AxiosError } from 'axios';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from './client';

// Answers every request with this status instead of going to the network, and keeps what was sent
let sent: InternalAxiosRequestConfig | undefined;
const answer = (status: number): AxiosAdapter => async (config) => {
    sent = config;
    const response = { status, statusText: '', headers: {}, config, data: status < 400 ? { ok: true } : { detail: 'x' } };
    if (status >= 400) throw new AxiosError('failed', 'ERR_BAD_RESPONSE', config, undefined, response);
    return response;
};

describe('apiClient', () => {
    const realAdapter = apiClient.defaults.adapter;

    beforeEach(() => {
        sent = undefined;
        localStorage.clear();
        vi.stubGlobal('location', { href: '/schedule' });
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        apiClient.defaults.adapter = realAdapter;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('sends the stored token as a Bearer header', async () => {
        localStorage.setItem('access_token', 'token-1');
        apiClient.defaults.adapter = answer(200);

        await apiClient.get('/api/employees');

        expect(sent?.headers.Authorization).toBe('Bearer token-1');
    });

    it('sends no Authorization header when signed out', async () => {
        apiClient.defaults.adapter = answer(200);

        await apiClient.get('/api/demo/status');

        expect(sent?.headers.Authorization).toBeUndefined();
    });

    it('signs out and goes to the login page when the session is rejected', async () => {
        localStorage.setItem('access_token', 'expired');
        apiClient.defaults.adapter = answer(401);

        await expect(apiClient.get('/api/employees')).rejects.toMatchObject({ response: { status: 401 } });

        expect(localStorage.getItem('access_token')).toBeNull();
        expect(window.location.href).toBe('/login');
    });

    it('leaves a failed login to the login form', async () => {
        localStorage.setItem('access_token', 'other-account');
        apiClient.defaults.adapter = answer(401);

        await expect(apiClient.post('/api/auth/login', 'username=a&password=b')).rejects.toMatchObject({ response: { status: 401 } });

        expect(localStorage.getItem('access_token')).toBe('other-account');
        expect(window.location.href).toBe('/schedule');
    });

    it('passes any other failure to the caller unchanged', async () => {
        localStorage.setItem('access_token', 'token-1');
        apiClient.defaults.adapter = answer(500);

        await expect(apiClient.get('/api/employees')).rejects.toBeInstanceOf(AxiosError);

        expect(localStorage.getItem('access_token')).toBe('token-1');
        expect(window.location.href).toBe('/schedule');
    });
});
