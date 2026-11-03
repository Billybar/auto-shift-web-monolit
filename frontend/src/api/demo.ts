// src/api/demo.ts
import { apiClient } from './client';
import type { DemoRole, DemoStatus, LoginResponse } from '../types';

/** Whether this instance is the public demo (public, no token needed). */
export const getDemoStatus = async (): Promise<DemoStatus> => {
    const response = await apiClient.get<DemoStatus>('/api/demo/status');
    return response.data;
};

/** Creates a private, seeded sandbox and returns its manager's token. 429 `demo_limit_reached` when rate limited. */
export const startDemoSession = async (): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/api/demo/session');
    return response.data;
};

/** A token for the manager or an employee of the caller's own sandbox. */
export const switchDemoRole = async (role: DemoRole): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/api/demo/switch', { role });
    return response.data;
};
