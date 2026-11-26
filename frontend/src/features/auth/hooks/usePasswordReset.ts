// src/features/auth/hooks/usePasswordReset.ts
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { confirmPasswordReset, requestPasswordReset } from '@/api/auth';
import { logError, toAppError } from '@/api/errors';

export type ResetStep = 'EMAIL_INPUT' | 'OTP_INPUT' | 'SUCCESS';

const OTP_LENGTH = 6;
const MIN_PASSWORD_LENGTH = 8;

// On this endpoint 400 means the code is wrong or expired (same wording as the mobile app)
const CONFIRM_ERRORS = { byStatus: { 400: 'הקוד שגוי או פג תוקפו.' } };

/**
 * The password reset flow: ask for a code by email, then send the code with the new password.
 * `error` is why the current step failed, in Hebrew.
 */
export function usePasswordReset() {
    const [step, setStep] = useState<ResetStep>('EMAIL_INPUT');
    const [validationError, setValidationError] = useState<string | null>(null);

    const requestMutation = useMutation({
        mutationFn: (email: string) => requestPasswordReset({ email }),
        // The backend answers the same for any email, so the flow always moves on
        onSuccess: () => setStep('OTP_INPUT'),
        onError: (error) => logError('Failed to request reset:', error),
    });
    const confirmMutation = useMutation({
        mutationFn: (data: { email: string; otp: string; newPassword: string }) =>
            confirmPasswordReset({ email: data.email, otp: data.otp, new_password: data.newPassword }),
        onSuccess: () => setStep('SUCCESS'),
        onError: (error) => logError('Reset failed:', error),
    });

    /** Shows a check that failed before sending, in place of the last server error. */
    const refuse = (message: string) => {
        requestMutation.reset();
        confirmMutation.reset();
        setValidationError(message);
    };

    const requestCode = (email: string) => {
        if (!email.trim()) {
            refuse('יש להזין כתובת מייל.');
            return;
        }
        setValidationError(null);
        requestMutation.mutate(email);
    };

    const confirm = (email: string, otp: string, newPassword: string) => {
        if (otp.length !== OTP_LENGTH) {
            refuse(`הקוד חייב להכיל בדיוק ${OTP_LENGTH} ספרות.`);
            return;
        }
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            refuse(`הסיסמא חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים`);
            return;
        }
        setValidationError(null);
        confirmMutation.mutate({ email, otp, newPassword });
    };

    const serverError = step === 'EMAIL_INPUT'
        ? (requestMutation.error ? toAppError(requestMutation.error).message : null)
        : (confirmMutation.error ? toAppError(confirmMutation.error, CONFIRM_ERRORS).message : null);

    return {
        step,
        requestCode,
        confirm,
        error: validationError ?? serverError,
        isPending: requestMutation.isPending || confirmMutation.isPending,
    };
}
