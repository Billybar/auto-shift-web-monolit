// src/features/demo/hooks/useDemo.ts
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { startDemoSession, switchDemoRole } from '../../../api/demo';
import { demoStatusQuery } from '../../../api/queries';
import { useAuth } from '../../../context/useAuth';
import type { DemoRole } from '../../../types';

/**
 * The public demo: whether this instance offers it, and the actions that log the visitor in.
 * `start` creates a fresh sandbox; `switchRole` views the same sandbox as its manager or an employee.
 * Both throw on failure, so the caller picks the feedback channel.
 */
export function useDemo() {
    const { login } = useAuth();
    // Fetched once per page load. Background check: on failure (only logged) the app behaves as a
    // regular instance, and the next screen that asks tries again.
    const { data: status, isPending } = useQuery(demoStatusQuery());

    const start = useCallback(async () => {
        const { access_token } = await startDemoSession();
        login(access_token);
    }, [login]);

    const switchRole = useCallback(async (role: DemoRole) => {
        const { access_token } = await switchDemoRole(role);
        login(access_token);
    }, [login]);

    return {
        isEnabled: status?.enabled ?? false,
        sandboxTtlHours: status?.sandbox_ttl_hours ?? 0,
        isStatusLoaded: !isPending,
        start,
        switchRole,
    };
}
