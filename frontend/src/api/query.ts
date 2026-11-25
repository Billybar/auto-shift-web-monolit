// src/api/query.ts
// TanStack Query setup: the client's defaults, and the load state the screens show
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { logError, toAppError } from './errors';
import type { AppError } from './errors';
import { notify } from '@/lib/notify';

declare module '@tanstack/react-query' {
    interface Register {
        queryMeta: {
            // Shown as an error toast when the query fails; without it a failure is only logged
            errorTitle?: string;
        };
    }
}

/**
 * The app's query client. Screens show failed loads themselves (InlineAlert); the cache only logs them,
 * or toasts them for a query that sets `meta.errorTitle`.
 */
export function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // One quick retry for a dropped connection or a server error, instead of the default three
                // (~7 s before an error shows). A timeout already waited and a 4xx won't change, so neither is retried.
                retry: (failureCount, error) => failureCount < 1 && ['network', 'server'].includes(toAppError(error).kind),
            },
        },
        queryCache: new QueryCache({
            onError: (error, query) => {
                if (query.meta?.errorTitle) notify.error(error, query.meta.errorTitle);
                else logError(`Query failed: ${JSON.stringify(query.queryKey)}`, error);
            },
        }),
    });
}

interface QueryState {
    isLoading: boolean;
    isLoadingError: boolean;
    isFetching: boolean;
    error: unknown;
}

export interface LoadStatus {
    // Nothing to show yet: the first load, or a retry after it failed
    isLoading: boolean;
    // The first load failed, so there is nothing to show. A failed background refetch keeps the
    // last data on screen and is only logged.
    loadError: AppError | null;
}

/** The load state of a screen built from one or more queries. */
export function loadStatus(...queries: QueryState[]): LoadStatus {
    const failed = queries.find(q => q.isLoadingError && !q.isFetching);
    return {
        isLoading: queries.some(q => q.isLoading || (q.isLoadingError && q.isFetching)),
        loadError: failed ? toAppError(failed.error) : null,
    };
}
