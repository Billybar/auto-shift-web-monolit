// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { logError } from '@/api/errors';
import { notify } from '@/lib/notify';
import { apiError, networkError, timeoutError } from '@/test/apiErrors';
import { createQueryClient, loadStatus } from './query';

const retry = (failureCount: number, error: unknown) => {
    const rule = createQueryClient().getDefaultOptions().queries?.retry;
    if (typeof rule !== 'function') throw new Error('expected a retry function');
    return rule(failureCount, error as Error);
};

describe('createQueryClient', () => {
    it('retries a dropped connection or a server error once', () => {
        expect(retry(0, networkError())).toBe(true);
        expect(retry(0, apiError(503))).toBe(true);
        expect(retry(1, networkError())).toBe(false);
        expect(retry(1, apiError(503))).toBe(false);
    });

    it("doesn't retry what a retry won't fix", () => {
        expect(retry(0, timeoutError())).toBe(false);
        expect(retry(0, apiError(404))).toBe(false);
        expect(retry(0, apiError(422))).toBe(false);
        expect(retry(0, new Error('bug'))).toBe(false);
    });

    it('toasts a failed query that has an error title', async () => {
        const error = apiError(404);

        await createQueryClient().fetchQuery({
            queryKey: ['shifts', 3], queryFn: () => Promise.reject(error), meta: { errorTitle: 'טעינת המשמרות נכשלה' },
        }).catch(() => {});

        expect(notify.error).toHaveBeenCalledWith(error, 'טעינת המשמרות נכשלה');
        expect(logError).not.toHaveBeenCalled();
    });

    it('only logs a failed query without one', async () => {
        const error = apiError(404);

        await createQueryClient().fetchQuery({ queryKey: ['shifts', 3], queryFn: () => Promise.reject(error) }).catch(() => {});

        expect(logError).toHaveBeenCalledWith('Query failed: ["shifts",3]', error);
        expect(notify.error).not.toHaveBeenCalled();
    });
});

describe('loadStatus', () => {
    const loaded = { isLoading: false, isLoadingError: false, isFetching: false, error: null };

    it('is ready once every query has data', () => {
        expect(loadStatus(loaded, loaded)).toEqual({ isLoading: false, loadError: null });
    });

    it('is loading while any query has nothing to show yet', () => {
        expect(loadStatus(loaded, { ...loaded, isLoading: true, isFetching: true })).toEqual({ isLoading: true, loadError: null });
    });

    it('reports a failed first load, in Hebrew', () => {
        const status = loadStatus(loaded, { ...loaded, isLoadingError: true, error: apiError(500) });

        expect(status.isLoading).toBe(false);
        expect(status.loadError).toMatchObject({ kind: 'server', status: 500 });
    });

    it('counts a retry after a failed first load as loading, not as an error', () => {
        expect(loadStatus({ ...loaded, isLoadingError: true, isFetching: true, error: apiError(500) }))
            .toEqual({ isLoading: true, loadError: null });
    });

    it('ignores a failed background refetch, which keeps the last data on screen', () => {
        expect(loadStatus({ ...loaded, error: apiError(500) })).toEqual({ isLoading: false, loadError: null });
    });
});
