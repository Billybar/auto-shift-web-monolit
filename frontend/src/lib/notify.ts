// src/lib/notify.ts
import { toast } from 'sonner';
import { logError, toAppError } from '../api/errors';
import type { AppError, ErrorMessageOverrides } from '../api/errors';

// How long each toast stays on screen (ms). Warnings and errors stay longer, so there's time to read why.
const DURATION = { success: 4000, info: 5000, warning: 8000, error: 8000 } as const;

// One shared id, so several requests failing while offline show a single toast instead of a stack
const NETWORK_TOAST_ID = 'network-error';

/**
 * The only way to show a toast (the ESLint config blocks importing `toast` elsewhere).
 * Toasts are for transient feedback: results of actions and failures of toolbar/background actions.
 * Errors that belong to an open form or dialog go inline instead (InlineAlert); decisions use useConfirm.
 */
export const notify = {
    success: (title: string, description?: string) =>
        toast.success(title, { description, duration: DURATION.success }),

    info: (title: string, description?: string) =>
        toast.info(title, { description, duration: DURATION.info }),

    warning: (title: string, description?: string) =>
        toast.warning(title, { description, duration: DURATION.warning }),

    /**
     * Shows what failed (`title`, e.g. 'שמירת הסידור נכשלה') and why (from the error), logs the error,
     * and returns the normalized error so the caller can branch on it.
     */
    error: (error: unknown, title: string, overrides?: ErrorMessageOverrides): AppError => {
        const appError = toAppError(error, overrides);
        logError(title, error);
        toast.error(title, {
            id: appError.kind === 'network' ? NETWORK_TOAST_ID : undefined,
            description: appError.message,
            duration: DURATION.error,
        });
        return appError;
    },
};
