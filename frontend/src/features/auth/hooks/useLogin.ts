// src/features/auth/hooks/useLogin.ts
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { loginUser } from '@/api/auth';
import { logError, toAppError } from '@/api/errors';
import { useAuth } from '@/context/useAuth';

// On this endpoint 401 means wrong credentials; a request that never reached the server gets the
// connection message, so the password isn't blamed for a network problem
const LOGIN_ERRORS = { byStatus: { 401: 'אימייל או סיסמה אינם נכונים.' } };

/**
 * The login form's action: checks the fields, signs in, and stores the session. `error` is why the
 * last attempt failed, in Hebrew. The page decides where to go next.
 */
export function useLogin() {
    const { login } = useAuth();
    const [validationError, setValidationError] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: ({ username, password }: { username: string; password: string }) => loginUser(username, password),
        onSuccess: ({ access_token }) => login(access_token),
        onError: (error) => logError('Login failed:', error),
    });

    /** Returns true once signed in. */
    const submit = async (username: string, password: string): Promise<boolean> => {
        if (!username.trim() || !password.trim()) {
            mutation.reset();
            setValidationError('יש להזין אימייל וסיסמא.');
            return false;
        }
        setValidationError(null);
        try {
            await mutation.mutateAsync({ username, password });
            return true;
        } catch {
            return false;
        }
    };

    const error = validationError ?? (mutation.error ? toAppError(mutation.error, LOGIN_ERRORS).message : null);

    return { submit, error, isPending: mutation.isPending };
}
