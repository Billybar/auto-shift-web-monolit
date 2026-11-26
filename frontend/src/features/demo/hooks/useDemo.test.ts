import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDemoStatus, startDemoSession, switchDemoRole } from '@/api/demo';
import { apiError } from '@/test/apiErrors';
import { createProvidersWrapper } from '@/test/renderWithProviders';
import type { DemoStatus } from '@/types';
import { useDemo } from './useDemo';

vi.mock('@/api/demo', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/demo')>()),
    getDemoStatus: vi.fn(),
    startDemoSession: vi.fn(),
    switchDemoRole: vi.fn(),
}));

const renderDemo = () => {
    const { wrapper, auth } = createProvidersWrapper({ user: null });
    const hook = renderHook(() => useDemo(), { wrapper });
    return { ...hook, auth };
};

describe('useDemo', () => {
    beforeEach(() => {
        vi.mocked(getDemoStatus).mockResolvedValue({ enabled: true, sandbox_ttl_hours: 24 });
        vi.mocked(startDemoSession).mockResolvedValue({ access_token: 'manager-token', token_type: 'bearer' });
        vi.mocked(switchDemoRole).mockResolvedValue({ access_token: 'employee-token', token_type: 'bearer' });
    });

    it('is off until the status loads, then follows it', async () => {
        let answer: (status: DemoStatus) => void = () => {};
        vi.mocked(getDemoStatus).mockReturnValue(new Promise(resolve => { answer = resolve; }));
        const { result } = renderDemo();

        expect(result.current).toMatchObject({ isEnabled: false, sandboxTtlHours: 0, isStatusLoaded: false });

        act(() => answer({ enabled: true, sandbox_ttl_hours: 24 }));

        await waitFor(() => expect(result.current.isStatusLoaded).toBe(true));
        expect(result.current).toMatchObject({ isEnabled: true, sandboxTtlHours: 24 });
    });

    it('starts a sandbox and logs in as its manager', async () => {
        const { result, auth } = renderDemo();

        await act(() => result.current.start());

        expect(startDemoSession).toHaveBeenCalledOnce();
        expect(auth.login).toHaveBeenCalledWith('manager-token');
    });

    it('switches to an employee of the same sandbox', async () => {
        const { result, auth } = renderDemo();

        await act(() => result.current.switchRole('employee'));

        expect(switchDemoRole).toHaveBeenCalledWith('employee');
        expect(auth.login).toHaveBeenCalledWith('employee-token');
    });

    it('throws a failure to the caller without logging in', async () => {
        const error = apiError(429, 'demo_limit_reached');
        vi.mocked(startDemoSession).mockRejectedValue(error);
        const { result, auth } = renderDemo();

        await act(async () => {
            await expect(result.current.start()).rejects.toBe(error);
        });

        expect(auth.login).not.toHaveBeenCalled();
    });
});
