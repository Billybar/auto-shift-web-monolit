// src/features/location-settings/hooks/managerIssue.ts
import { logError, toAppError } from '@/api/errors';
import type { Position } from '@/types';

/** The result of the last failed or partly done action, shown above the list until the next one. */
export interface ManagerIssue {
    variant: 'error' | 'warning';
    title: string;
    message: string;
    // Offered when a role in use can't be deleted
    archivePosition?: Position;
}

/** Logs a failed action and describes it for the list's alert. */
export const failureIssue = (title: string, error: unknown): ManagerIssue => {
    logError(title, error);
    return { variant: 'error', title, message: toAppError(error).message };
};
