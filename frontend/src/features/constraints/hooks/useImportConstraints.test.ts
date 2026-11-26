import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

import { importConstraintsFromHtml } from '@/api/constraints';
import { upcomingSunday } from '@/lib/dates';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { ImportConstraintsResult } from '@/types';
import { htmlFileError, useImportConstraints } from './useImportConstraints';

// queries.ts reads the module's fetchers, so they stay real
vi.mock('@/api/constraints', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraints')>()),
    importConstraintsFromHtml: vi.fn(),
}));
vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// Keeps the expected failures out of the test output
vi.mock('@/api/errors', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/errors')>()),
    logError: vi.fn(),
}));

const LOCATION = 3;
const EXPORT = new File(['<html></html>'], 'Week.HTML', { type: 'text/html' });

const importResult = (processed: number, missing: string[] = [], notes = 0): ImportConstraintsResult => ({
    status: 'success', processed_employees_count: processed, imported_notes_count: notes, missing_employees_ids: missing,
});

const codedError = (status: number, code: string) => new AxiosError('failed', String(status), undefined, undefined, {
    status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: { detail: 'x', code },
});

// Every cached view of submitted constraints
const CONSTRAINT_VIEWS = [['constraintBoard'], ['employeeConstraints'], ['constraintSubmissions']];

const renderImport = () => {
    const { client, wrapper } = createQueryWrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    return { ...renderHook(() => useImportConstraints(LOCATION), { wrapper }), invalidate };
};

describe('htmlFileError', () => {
    it('accepts .html and .htm in any case', () => {
        expect(htmlFileError(new File([], 'week.html'))).toBeNull();
        expect(htmlFileError(new File([], 'WEEK.HTM'))).toBeNull();
    });

    it('refuses any other file', () => {
        expect(htmlFileError(new File([], 'week.xlsx'))).toBe('יש לבחור קובץ HTML (סיומת ‎.html או ‎.htm).');
        expect(htmlFileError(new File([], 'html'))).not.toBeNull();
    });
});

describe('useImportConstraints', () => {
    beforeEach(() => {
        // clearAllMocks keeps implementations, so a failure set by one test would leak into the next
        vi.clearAllMocks();
        vi.mocked(importConstraintsFromHtml).mockResolvedValue(importResult(5));
    });

    it('starts on the first source and the upcoming week, with no file', () => {
        const { result } = renderImport();

        expect(result.current).toMatchObject({ file: null, source: 'yalam', weekStart: upcomingSunday(), error: null, result: null });
    });

    it('refuses a file that is not an HTML export', () => {
        const { result } = renderImport();

        act(() => result.current.chooseFile(new File([], 'week.pdf')));

        expect(result.current.file).toBeNull();
        expect(result.current.error).toBe('יש לבחור קובץ HTML (סיומת ‎.html או ‎.htm).');

        act(() => result.current.chooseFile(EXPORT));
        expect(result.current.file).toBe(EXPORT);
        expect(result.current.error).toBeNull();
    });

    it('asks for a file before importing', async () => {
        const { result } = renderImport();

        let clean = true;
        await act(async () => { clean = await result.current.submit(); });

        expect(clean).toBe(false);
        expect(result.current.error).toBe('יש לבחור קובץ HTML לייבוא.');
        expect(importConstraintsFromHtml).not.toHaveBeenCalled();
    });

    it('imports into the location, refreshes the constraints and reports a clean import', async () => {
        vi.mocked(importConstraintsFromHtml).mockResolvedValue(importResult(5, [], 2));
        const { result, invalidate } = renderImport();
        act(() => {
            result.current.chooseFile(EXPORT);
            result.current.setSource('mishmarot');
            result.current.setWeekStart('2026-12-06');
        });

        let clean = false;
        await act(async () => { clean = await result.current.submit(); });

        expect(clean).toBe(true);
        expect(importConstraintsFromHtml).toHaveBeenCalledWith(EXPORT, 'mishmarot', '2026-12-06', LOCATION);
        CONSTRAINT_VIEWS.forEach(queryKey => expect(invalidate).toHaveBeenCalledWith({ queryKey }));
        expect(notify.success).toHaveBeenCalledWith('האילוצים יובאו', 'עודכנו אילוצים עבור 5 עובדים ו-2 הערות.');
        expect(result.current.result).toBeNull();
    });

    it('keeps a partial import on screen to explain the unlinked employees', async () => {
        vi.mocked(importConstraintsFromHtml).mockResolvedValue(importResult(3, ['111', '222']));
        const { result, invalidate } = renderImport();
        act(() => result.current.chooseFile(EXPORT));

        let clean = true;
        await act(async () => { clean = await result.current.submit(); });

        expect(clean).toBe(false);
        // The mutation's data lands on a later tick
        await vi.waitFor(() => expect(result.current.result?.missing_employees_ids).toEqual(['111', '222']));
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['constraintBoard'] });
        expect(notify.success).not.toHaveBeenCalled();
    });

    it("doesn't refresh anything when nobody was found in the file", async () => {
        vi.mocked(importConstraintsFromHtml).mockResolvedValue(importResult(0));
        const { result, invalidate } = renderImport();
        act(() => result.current.chooseFile(EXPORT));

        await act(() => result.current.submit());

        await vi.waitFor(() => expect(result.current.result?.processed_employees_count).toBe(0));
        expect(invalidate).not.toHaveBeenCalled();
    });

    it("explains a failed import with the backend's code", async () => {
        vi.mocked(importConstraintsFromHtml).mockRejectedValue(codedError(400, 'import_no_shift_definitions'));
        const { result } = renderImport();
        act(() => result.current.chooseFile(EXPORT));

        await act(() => result.current.submit());

        await vi.waitFor(() => expect(result.current.error).toBe('לא הוגדרו משמרות לאתר זה. הגדר משמרות לפני ייבוא אילוצים.'));
        expect(result.current.file).toBe(EXPORT);
    });
});
