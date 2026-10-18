// mobile/api/errors.ts
// Mirrors frontend/src/api/errors.ts (same kinds and Hebrew copy), so both apps explain failures the same way.
import { isAxiosError } from 'axios';
import type { ApiErrorBody } from '../src/types';

/**
 * What went wrong, from the user's point of view.
 */
export type AppErrorKind =
    | 'network'       // The request never reached the server (offline, server down)
    | 'timeout'       // The server didn't answer in time
    | 'unauthorized'  // 401
    | 'forbidden'     // 403
    | 'not_found'     // 404
    | 'conflict'      // 409
    | 'validation'    // 400 / 422
    | 'server'        // 5xx
    | 'unknown';      // Anything else, including bugs in our own code

/**
 * Any thrown value, normalized. `message` is Hebrew and safe to show; `detail` is for logs only.
 */
export interface AppError {
    kind: AppErrorKind;
    status?: number;
    code?: string;
    params: Record<string, unknown>;
    message: string;
    detail?: unknown;
}

/**
 * Per-call messages for what a status or code means on a specific screen
 * (e.g. 401 on the login form means "wrong email or password", not "session expired").
 * There is no code catalog yet: no endpoint the app calls sends an error code.
 */
export interface ErrorMessageOverrides {
    byStatus?: Partial<Record<number, string>>;
    byCode?: Partial<Record<string, string>>;
}

const MESSAGES_BY_KIND: Record<AppErrorKind, string> = {
    network: 'לא ניתן להתחבר לשרת. בדוק את החיבור לאינטרנט ונסה שוב.',
    timeout: 'השרת לא הגיב בזמן. נסה שוב בעוד רגע.',
    unauthorized: 'פג תוקף ההתחברות. יש להתחבר מחדש.',
    forbidden: 'אין לך הרשאה לבצע פעולה זו.',
    not_found: 'הפריט המבוקש לא נמצא. ייתכן שנמחק – רענן ונסה שוב.',
    conflict: 'הפעולה מתנגשת בנתונים קיימים. רענן ונסה שוב.',
    validation: 'חלק מהנתונים שנשלחו אינם תקינים. בדוק את הפרטים ונסה שוב.',
    server: 'אירעה שגיאה בשרת. נסה שוב בעוד מספר דקות.',
    unknown: 'אירעה שגיאה לא צפויה. נסה שוב.',
};

const kindFromStatus = (status: number): AppErrorKind => {
    if (status === 401) return 'unauthorized';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not_found';
    if (status === 408) return 'timeout';
    if (status === 409) return 'conflict';
    if (status === 400 || status === 422) return 'validation';
    if (status >= 500) return 'server';
    return 'unknown';
};

// FastAPI errors are JSON, but a crash before FastAPI handles it (e.g. an unhandled 500) is plain text
const getErrorBody = (data: unknown): ApiErrorBody =>
    typeof data === 'object' && data !== null ? (data as ApiErrorBody) : {};

/**
 * Normalizes anything thrown (axios error, timeout, plain Error) into an AppError.
 * Message order: per-call `byCode` → per-call `byStatus` → the default for the kind.
 * The backend's raw `detail` is never used as the message.
 */
export function toAppError(error: unknown, overrides: ErrorMessageOverrides = {}): AppError {
    if (!isAxiosError(error)) {
        return { kind: 'unknown', params: {}, message: MESSAGES_BY_KIND.unknown, detail: error };
    }

    // A timeout also has no response, so check it before the network case
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return { kind: 'timeout', params: {}, message: MESSAGES_BY_KIND.timeout, detail: error.message };
    }

    // No response at all: the request never reached the server (offline, unreachable host, TLS failure)
    if (!error.response) {
        return { kind: 'network', params: {}, message: MESSAGES_BY_KIND.network, detail: error.message };
    }

    const status = error.response.status;
    const body = getErrorBody(error.response.data);
    const code = body.code;
    const kind = kindFromStatus(status);

    const message =
        (code ? overrides.byCode?.[code] : undefined) ??
        overrides.byStatus?.[status] ??
        MESSAGES_BY_KIND[kind];

    return { kind, status, code, params: body.params ?? {}, message, detail: body.detail ?? error.response.data };
}

/**
 * Logs an error for debugging. For API errors it logs only the useful fields, because the full
 * axios error includes the request config with the Bearer token.
 */
export function logError(context: string, error: unknown): void {
    if (!isAxiosError(error)) {
        console.error(context, error);
        return;
    }
    const body = getErrorBody(error.response?.data);
    console.error(context, {
        status: error.response?.status,
        code: body.code ?? error.code,
        detail: body.detail ?? error.message,
        method: error.config?.method?.toUpperCase(),
        url: error.config?.url,
    });
}
