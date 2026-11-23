// src/test/queryWrapper.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * A fresh query client for one test, and a wrapper that provides it (for renderHook / render).
 * Without retries, so a failed request fails at once. Pass a client to test the app's own setup.
 */
export function createQueryWrapper(
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
) {
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { client, wrapper };
}
