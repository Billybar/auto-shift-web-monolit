// mobile/src/lib/notify.ts
// Same API as the web's src/lib/notify.ts. The toasts are drawn by the root <Toaster>.
import { logError, toAppError } from '../../api/errors';
import type { AppError, ErrorMessageOverrides } from '../../api/errors';

export type ToastVariant = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
    id: number;
    variant: ToastVariant;
    title: string;
    description?: string;
    duration: number;
}

// How long each toast stays on screen (ms). Warnings and errors stay longer, so there's time to read why.
const DURATION: Record<ToastVariant, number> = { success: 4000, info: 5000, warning: 8000, error: 8000 };

// One toast at a time, like an Android snackbar: a new toast replaces the current one,
// so several requests failing while offline don't pile up
let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

const show = (variant: ToastVariant, title: string, description?: string) => {
    current = { id: nextId++, variant, title, description, duration: DURATION[variant] };
    listeners.forEach(listener => listener());
};

/**
 * The toast store, read by <Toaster> through useSyncExternalStore.
 */
export const toastStore = {
    subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
    getSnapshot: () => current,
    // Ignores a stale id, so an old toast's timer can't close the toast that replaced it
    dismiss: (id: number) => {
        if (current?.id !== id) return;
        current = null;
        listeners.forEach(listener => listener());
    },
};

/**
 * Transient feedback: results of actions and failures of button/background actions.
 * Errors that belong to an open form go inline instead (InlineAlert). Decisions, and anything shown
 * while a Sheet is open (a Modal is drawn above the toast), use Alert.alert.
 */
export const notify = {
    success: (title: string, description?: string) => show('success', title, description),

    info: (title: string, description?: string) => show('info', title, description),

    warning: (title: string, description?: string) => show('warning', title, description),

    /**
     * Shows what failed (`title`, e.g. 'השינוי לא נשמר') and why (from the error), logs the error,
     * and returns the normalized error so the caller can branch on it.
     */
    error: (error: unknown, title: string, overrides?: ErrorMessageOverrides): AppError => {
        const appError = toAppError(error, overrides);
        logError(title, error);
        show('error', title, appError.message);
        return appError;
    },
};
