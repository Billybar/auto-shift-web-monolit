// src/test/apiErrors.ts
// What apiClient throws, for tests that mock an @/api/<module> function to reject
import { AxiosError, AxiosHeaders } from 'axios';
import type { ErrorCode } from '@/types';

/** A response with this status and a FastAPI error body (`code` and `params` as AppError sends them). */
export const apiError = (status: number, code?: ErrorCode, params?: Record<string, unknown>): AxiosError =>
    new AxiosError('failed', String(status), { headers: new AxiosHeaders() }, undefined, {
        status,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { detail: 'x', code, params },
    });

/** The request never reached the server (offline, server down). */
export const networkError = () => new AxiosError('Network Error', AxiosError.ERR_NETWORK);

/** The server didn't answer in time. */
export const timeoutError = () => new AxiosError('timeout of 30000ms exceeded', AxiosError.ECONNABORTED);
