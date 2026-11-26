// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { logError } from '@/api/errors';
import { apiError, networkError } from '@/test/apiErrors';
import { notify } from './notify';

// This file tests the real notify, which setup.ts mocks for every other file; sonner's toast is the fake instead
vi.unmock('@/lib/notify');
const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

describe('notify', () => {
    it('shows successes, infos and warnings for longer the more there is to read', () => {
        notify.success('הסידור נשמר', '3 שיבוצים נוספו');
        notify.info('אין שינויים לשמירה');
        notify.warning('חלק מהעובדים לא קושרו');

        expect(toast.success).toHaveBeenCalledWith('הסידור נשמר', { description: '3 שיבוצים נוספו', duration: 4000 });
        expect(toast.info).toHaveBeenCalledWith('אין שינויים לשמירה', { description: undefined, duration: 5000 });
        expect(toast.warning).toHaveBeenCalledWith('חלק מהעובדים לא קושרו', { description: undefined, duration: 8000 });
    });

    it('shows what failed and why, logs it, and returns the normalized error', () => {
        const error = apiError(409, 'schedule_concurrent_edit');

        const appError = notify.error(error, 'שמירת הסידור נכשלה');

        expect(appError).toMatchObject({ kind: 'conflict', code: 'schedule_concurrent_edit' });
        expect(toast.error).toHaveBeenCalledWith('שמירת הסידור נכשלה', {
            id: undefined, description: appError.message, duration: 8000,
        });
        expect(logError).toHaveBeenCalledWith('שמירת הסידור נכשלה', error);
    });

    it("uses the screen's message overrides", () => {
        notify.error(apiError(404), 'מחיקת העובד נכשלה', { byStatus: { 404: 'העובד כבר נמחק.' } });

        expect(toast.error).toHaveBeenCalledWith('מחיקת העובד נכשלה', expect.objectContaining({ description: 'העובד כבר נמחק.' }));
    });

    it('folds network failures into one toast, so going offline shows a single message', () => {
        notify.error(networkError(), 'טעינת הסידור נכשלה');
        notify.error(networkError(), 'טעינת העובדים נכשלה');

        expect(toast.error).toHaveBeenNthCalledWith(1, 'טעינת הסידור נכשלה', expect.objectContaining({ id: 'network-error' }));
        expect(toast.error).toHaveBeenNthCalledWith(2, 'טעינת העובדים נכשלה', expect.objectContaining({ id: 'network-error' }));
    });
});
