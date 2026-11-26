// src/features/demo/hooks/useDemoStart.ts
import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { logError, toAppError } from '@/api/errors';
import { useAuth } from '@/context/useAuth';
import { useDemo } from './useDemo';

const START_ERRORS = { byStatus: { 404: 'סביבת ההדגמה אינה זמינה באתר זה.' } };

/**
 * Starts the demo once, when the page opens: creates a sandbox, logs the visitor in and opens the
 * schedule. A visitor who is already logged in goes straight in. `error` is why the start failed,
 * in Hebrew, and `retry` tries again.
 */
export function useDemoStart() {
    const { isAuthenticated, isLoading } = useAuth();
    const { start } = useDemo();
    const navigate = useNavigate();
    // Decides once per visit, even when StrictMode runs the effect twice
    const startedRef = useRef(false);

    const mutation = useMutation({
        mutationFn: start,
        onSuccess: () => navigate('/', { replace: true }),
        onError: (error) => logError('Demo start failed:', error),
    });
    const { mutate } = mutation;

    useEffect(() => {
        // Wait until AuthContext has read the stored token
        if (isLoading || startedRef.current) return;
        startedRef.current = true;
        // Already logged in: reuse that session instead of creating another sandbox
        if (isAuthenticated) {
            navigate('/', { replace: true });
            return;
        }
        mutate();
    }, [isLoading, isAuthenticated, mutate, navigate]);

    return {
        error: mutation.error ? toAppError(mutation.error, START_ERRORS).message : null,
        retry: () => mutate(),
    };
}
