// @vitest-environment node
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiError, networkError, timeoutError } from '@/test/apiErrors';
import type { ErrorCode } from '@/types';
import { logError, toAppError } from './errors';

// This file tests the real logError, which setup.ts mocks for every other file
vi.unmock('@/api/errors');

const DEFAULT = {
    network: 'לא ניתן להתחבר לשרת. בדוק את החיבור לאינטרנט ונסה שוב.',
    timeout: 'השרת לא הגיב בזמן. נסה שוב בעוד רגע.',
    forbidden: 'אין לך הרשאה לבצע פעולה זו.',
    validation: 'חלק מהנתונים שנשלחו אינם תקינים. בדוק את הפרטים ונסה שוב.',
    server: 'אירעה שגיאה בשרת. נסה שוב בעוד מספר דקות.',
    unknown: 'אירעה שגיאה לא צפויה. נסה שוב.',
};
const NAME_TAKEN = 'כבר קיים באתר תפקיד בשם הזה. בחר שם אחר.';

describe('toAppError', () => {
    it('treats anything that is not an HTTP error as unknown, keeping it for the logs', () => {
        const bug = new TypeError("Cannot read properties of undefined (reading 'id')");

        expect(toAppError(bug)).toEqual({ kind: 'unknown', params: {}, message: DEFAULT.unknown, detail: bug });
    });

    it('tells a timeout from a lost connection, though neither has a response', () => {
        expect(toAppError(timeoutError())).toMatchObject({ kind: 'timeout', message: DEFAULT.timeout });
        expect(toAppError(new AxiosError('socket hang up', 'ETIMEDOUT'))).toMatchObject({ kind: 'timeout' });
        expect(toAppError(networkError())).toMatchObject({ kind: 'network', message: DEFAULT.network });
    });

    it.each([
        [401, 'unauthorized'],
        [403, 'forbidden'],
        [404, 'not_found'],
        [408, 'timeout'],
        [409, 'conflict'],
        [400, 'validation'],
        [422, 'validation'],
        [500, 'server'],
        [503, 'server'],
        [418, 'unknown'],
    ])('maps status %i to %s', (status, kind) => {
        expect(toAppError(apiError(status))).toMatchObject({ kind, status });
    });

    it('keeps the code and params of an AppError response', () => {
        const error = toAppError(apiError(400, 'import_parse_failed', { source: 'yalam' }));

        expect(error).toMatchObject({ kind: 'validation', status: 400, code: 'import_parse_failed', params: { source: 'yalam' }, detail: 'x' });
    });

    describe('message', () => {
        const overrides = {
            byCode: { position_name_taken: 'override for the code' },
            byStatus: { 409: 'override for the status', 401: 'אימייל או סיסמה אינם נכונים.' },
        };

        it("prefers the screen's message for the code", () => {
            expect(toAppError(apiError(409, 'position_name_taken'), overrides).message).toBe('override for the code');
        });

        it("then the catalog's message for the code, before the screen's message for the status", () => {
            expect(toAppError(apiError(409, 'position_name_taken'), { byStatus: overrides.byStatus }).message).toBe(NAME_TAKEN);
        });

        it("then the screen's message for the status", () => {
            expect(toAppError(apiError(401), overrides).message).toBe('אימייל או סיסמה אינם נכונים.');
        });

        it('then the default for the kind', () => {
            expect(toAppError(apiError(403), overrides).message).toBe(DEFAULT.forbidden);
        });

        it('falls through to the generic messages for a code this client does not know yet', () => {
            const newer = apiError(400, 'added_in_a_later_release' as ErrorCode);

            expect(toAppError(newer).message).toBe(DEFAULT.validation);
            expect(toAppError(newer, { byStatus: { 400: 'for the status' } }).message).toBe('for the status');
        });

        it('names the source an import was parsed as', () => {
            expect(toAppError(apiError(400, 'import_parse_failed', { source: 'mishmarot' })).message)
                .toBe('הקובץ לא זוהה כקובץ אילוצים של Mishmarot. ודא שבחרת את מקור הנתונים הנכון.');
            expect(toAppError(apiError(400, 'import_parse_failed', { source: 'other' })).message)
                .toContain('של המערכת שנבחרה.');
        });

        it('names the shift with invalid hours, when the backend sends it', () => {
            expect(toAppError(apiError(400, 'shift_invalid_hours', { shift_name: 'לילה' })).message)
                .toMatch(/^לשעות של המשמרת "לילה" אין ערך תקין\./);
            expect(toAppError(apiError(400, 'shift_invalid_hours')).message)
                .toMatch(/^לשעות של המשמרת אין ערך תקין\./);
        });

        it("never shows the backend's raw detail", () => {
            const error = apiError(400);
            error.response!.data = { detail: 'value is not a valid integer' };

            expect(toAppError(error)).toMatchObject({ message: DEFAULT.validation, detail: 'value is not a valid integer' });
        });

        it('handles a plain-text body from a crash before FastAPI', () => {
            const error = apiError(502);
            error.response!.data = '<html>Bad Gateway</html>';

            expect(toAppError(error)).toMatchObject({ kind: 'server', message: DEFAULT.server, params: {}, detail: '<html>Bad Gateway</html>' });
        });
    });
});

describe('logError', () => {
    afterEach(() => vi.restoreAllMocks());

    it('logs only the useful fields of an API error, never the Bearer token', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const headers = new AxiosHeaders({ Authorization: 'Bearer secret-token' });
        const error = new AxiosError('failed', 'ERR_BAD_REQUEST', { headers, method: 'post', url: '/api/positions' }, undefined, {
            status: 409, statusText: '', headers: {}, config: { headers }, data: { detail: 'Name taken', code: 'position_name_taken' },
        });

        logError('Saving the position failed:', error);

        expect(consoleError).toHaveBeenCalledWith('Saving the position failed:', {
            status: 409, code: 'position_name_taken', detail: 'Name taken', method: 'POST', url: '/api/positions',
        });
        expect(JSON.stringify(consoleError.mock.calls)).not.toContain('secret-token');
    });

    it("falls back to axios's code and message when there is no response", () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        logError('Load failed:', networkError());

        expect(consoleError).toHaveBeenCalledWith('Load failed:', expect.objectContaining({ status: undefined, code: 'ERR_NETWORK', detail: 'Network Error' }));
    });

    it('logs anything else as it is', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const bug = new Error('boom');

        logError('Render failed:', bug);

        expect(consoleError).toHaveBeenCalledWith('Render failed:', bug);
    });
});
