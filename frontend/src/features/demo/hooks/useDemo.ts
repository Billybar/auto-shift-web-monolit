// src/features/demo/hooks/useDemo.ts
import { useCallback, useEffect, useState } from 'react';
import { getDemoStatus, startDemoSession, switchDemoRole } from '../../../api/demo';
import { logError } from '../../../api/errors';
import { useAuth } from '../../../context/AuthContext';
import type { DemoRole, DemoStatus } from '../../../types';

// Fetched once per page load: whether the instance is the demo never changes while it runs
let statusRequest: Promise<DemoStatus> | null = null;

const loadStatus = (): Promise<DemoStatus> => {
    if (!statusRequest) {
        statusRequest = getDemoStatus().catch((error) => {
            // Background check: on failure the app simply behaves as a regular instance
            logError('Failed to fetch demo status:', error);
            statusRequest = null;
            return { enabled: false, sandbox_ttl_hours: 0 };
        });
    }
    return statusRequest;
};

/**
 * The public demo: whether this instance offers it, and the actions that log the visitor in.
 * `start` creates a fresh sandbox; `switchRole` views the same sandbox as its manager or an employee.
 * Both throw on failure, so the caller picks the feedback channel.
 */
export function useDemo() {
    const { login } = useAuth();
    const [status, setStatus] = useState<DemoStatus | null>(null);

    useEffect(() => {
        let isMounted = true;
        loadStatus().then((result) => {
            if (isMounted) setStatus(result);
        });
        return () => { isMounted = false; };
    }, []);

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
        isStatusLoaded: status !== null,
        start,
        switchRole,
    };
}
