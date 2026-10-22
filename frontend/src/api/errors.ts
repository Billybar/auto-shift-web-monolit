// src/api/errors.ts
import { isAxiosError } from 'axios';
import type { ApiErrorBody, ErrorCode } from '../types';

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
    code?: ErrorCode;
    params: Record<string, unknown>;
    message: string;
    detail?: unknown;
}

/**
 * Per-call messages for what a status or code means on a specific screen
 * (e.g. 401 on the login form means "wrong email or password", not "session expired").
 */
export interface ErrorMessageOverrides {
    byStatus?: Partial<Record<number, string>>;
    byCode?: Partial<Record<ErrorCode, string>>;
}

const MESSAGES_BY_KIND: Record<AppErrorKind, string> = {
    // Same wording as the mobile app
    network: 'לא ניתן להתחבר לשרת. בדוק את החיבור לאינטרנט ונסה שוב.',
    timeout: 'השרת לא הגיב בזמן. נסה שוב בעוד רגע.',
    unauthorized: 'פג תוקף ההתחברות. יש להתחבר מחדש.',
    forbidden: 'אין לך הרשאה לבצע פעולה זו.',
    not_found: 'הפריט המבוקש לא נמצא. ייתכן שנמחק – רענן את הדף ונסה שוב.',
    conflict: 'הפעולה מתנגשת בנתונים קיימים. רענן את הדף ונסה שוב.',
    validation: 'חלק מהנתונים שנשלחו אינם תקינים. בדוק את הפרטים ונסה שוב.',
    server: 'אירעה שגיאה בשרת. נסה שוב בעוד מספר דקות.',
    unknown: 'אירעה שגיאה לא צפויה. נסה שוב.',
};

const SOURCE_NAMES: Record<string, string> = {
    yalam: 'Yalam',
    mishmarot: 'Mishmarot',
    shiftorg: 'Shift Organizer',
};

// One entry per backend ErrorCode; TypeScript fails the build if a code is missing here
const MESSAGES_BY_CODE: Record<ErrorCode, string | ((params: Record<string, unknown>) => string)> = {
    location_not_found: 'האתר לא נמצא. רענן את הדף ובחר אתר מהרשימה.',
    schedule_no_active_employees: 'אין עובדים פעילים באתר זה. הוסף עובדים או סמן אותם כפעילים לפני הרצת שיבוץ אוטומטי.',
    import_invalid_file_type: 'יש לבחור קובץ HTML.',
    import_unreadable_file: 'לא ניתן היה לקרוא את הקובץ. בחר אותו שוב ונסה שוב.',
    import_unsupported_encoding: 'קידוד הקובץ אינו נתמך. ייצא את הקובץ מחדש מהמערכת החיצונית ונסה שוב.',
    import_source_not_supported: 'ייבוא ממקור זה עדיין לא נתמך.',
    import_no_shift_definitions: 'לא הוגדרו משמרות לאתר זה. הגדר משמרות לפני ייבוא אילוצים.',
    import_parse_failed: (params) =>
        `הקובץ לא זוהה כקובץ אילוצים של ${SOURCE_NAMES[String(params.source)] ?? 'המערכת שנבחרה'}. ודא שבחרת את מקור הנתונים הנכון.`,
    position_name_taken: 'כבר קיים באתר תפקיד בשם הזה. בחר שם אחר.',
    position_in_use: 'התפקיד משמש במשמרות קיימות, ולכן אי אפשר למחוק אותו. אפשר להעביר אותו לארכיון במקום.',
    position_invalid: 'אחד התפקידים שנבחרו כבר לא שייך לאתר או הועבר לארכיון. רענן את הדף ונסה שוב.',
    employee_has_no_positions: 'לאחד העובדים אין תפקיד, ולכן אי אפשר לשבץ אותו. הגדר לו תפקיד בניהול העובדים.',
    schedule_no_staffable_employees: 'לאף עובד פעיל באתר אין תפקיד פעיל. הגדר תפקידים לעובדים לפני הרצת שיבוץ אוטומטי.',
    schedule_concurrent_edit: 'הסידור שונה במקביל על ידי משתמש אחר. רענן את הדף ונסה שוב.',
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
 * Message order: per-call `byCode` → the catalog entry for the backend `code` → per-call `byStatus`
 * → the default for the kind. The backend's raw `detail` is never used as the message.
 */
export function toAppError(error: unknown, overrides: ErrorMessageOverrides = {}): AppError {
    if (!isAxiosError(error)) {
        return { kind: 'unknown', params: {}, message: MESSAGES_BY_KIND.unknown, detail: error };
    }

    // A timeout also has no response, so check it before the network case
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return { kind: 'timeout', params: {}, message: MESSAGES_BY_KIND.timeout, detail: error.message };
    }

    // No response at all: the request never reached the server (same check as mobile/api/errors.ts)
    if (!error.response) {
        return { kind: 'network', params: {}, message: MESSAGES_BY_KIND.network, detail: error.message };
    }

    const status = error.response.status;
    const body = getErrorBody(error.response.data);
    const code = body.code;
    const params = body.params ?? {};
    const kind = kindFromStatus(status);

    // An older client may not know a newer backend code; it then falls through to the generic messages
    const catalogEntry = code ? MESSAGES_BY_CODE[code] : undefined;
    const codeMessage = typeof catalogEntry === 'function' ? catalogEntry(params) : catalogEntry;

    const message =
        (code ? overrides.byCode?.[code] : undefined) ??
        codeMessage ??
        overrides.byStatus?.[status] ??
        MESSAGES_BY_KIND[kind];

    return { kind, status, code, params, message, detail: body.detail ?? error.response.data };
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
