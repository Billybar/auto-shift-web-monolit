import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSchedulePublication, setSchedulePublication } from '@/api/assignments';
import { constraintSubmissionsQuery, publicationQuery } from '@/api/queries';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { SchedulePublication } from '@/types';
import { useSchedulePublication } from './useSchedulePublication';

vi.mock('@/api/assignments', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/assignments')>()),
    getSchedulePublication: vi.fn(),
    setSchedulePublication: vi.fn(),
}));

const WEEK = '2026-10-25';
const DRAFT: SchedulePublication = { location_id: 5, week_start_date: WEEK, is_published: false, published_at: null };
const PUBLISHED: SchedulePublication = { ...DRAFT, is_published: true, published_at: '2026-10-20T10:00:00' };

const renderPublication = async (locationId: number | null = 5) => {
    const { client, wrapper } = createQueryWrapper();
    const hook = renderHook(() => useSchedulePublication(locationId, WEEK), { wrapper });
    if (locationId) await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
    return { ...hook, client };
};

describe('useSchedulePublication', () => {
    beforeEach(() => {
        vi.mocked(getSchedulePublication).mockResolvedValue(DRAFT);
    });

    it("loads the week's status", async () => {
        vi.mocked(getSchedulePublication).mockResolvedValue(PUBLISHED);
        const { result } = await renderPublication();

        expect(getSchedulePublication).toHaveBeenCalledWith(5, WEEK);
        expect(result.current).toMatchObject({ isPublished: true, publishedAt: '2026-10-20T10:00:00', loadError: null });
    });

    it('publishes, updates the cache and resets the submission markers', async () => {
        vi.mocked(setSchedulePublication).mockResolvedValue(PUBLISHED);
        const { result, client } = await renderPublication();
        const reset = vi.spyOn(client, 'resetQueries');

        let ok: boolean | undefined;
        await act(async () => { ok = await result.current.setPublished(true); });

        expect(ok).toBe(true);
        expect(setSchedulePublication).toHaveBeenCalledWith(5, WEEK, true);
        expect(notify.success).toHaveBeenCalledWith('הסידור פורסם לעובדים');
        expect(client.getQueryData(publicationQuery(5, WEEK).queryKey)).toEqual(PUBLISHED);
        await waitFor(() => expect(result.current.isPublished).toBe(true));
        expect(reset).toHaveBeenCalledWith({ queryKey: constraintSubmissionsQuery(5, WEEK).queryKey });
    });

    it('unpublishes back to a draft', async () => {
        vi.mocked(getSchedulePublication).mockResolvedValue(PUBLISHED);
        vi.mocked(setSchedulePublication).mockResolvedValue(DRAFT);
        const { result } = await renderPublication();

        await act(() => result.current.setPublished(false));

        expect(setSchedulePublication).toHaveBeenCalledWith(5, WEEK, false);
        expect(notify.info).toHaveBeenCalledWith('הסידור הוחזר למצב טיוטה', 'המשמרות מוסתרות מהעובדים');
        await waitFor(() => expect(result.current.isPublished).toBe(false));
    });

    it.each([
        [true, 'פרסום הסידור נכשל'],
        [false, 'ביטול הפרסום נכשל'],
    ])('reports a failure (publish: %s)', async (publish, title) => {
        const error = apiError(500);
        vi.mocked(setSchedulePublication).mockRejectedValue(error);
        const { result } = await renderPublication();

        let ok: boolean | undefined;
        await act(async () => { ok = await result.current.setPublished(publish); });

        expect(ok).toBe(false);
        expect(notify.error).toHaveBeenCalledWith(error, title);
    });

    it('does nothing without a location', async () => {
        const { result } = await renderPublication(null);

        let ok: boolean | undefined;
        await act(async () => { ok = await result.current.setPublished(true); });

        expect(ok).toBe(false);
        expect(getSchedulePublication).not.toHaveBeenCalled();
        expect(setSchedulePublication).not.toHaveBeenCalled();
    });
});
