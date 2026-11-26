// src/test/setup.ts
// Runs before every test file (vite.config.ts → test.setupFiles)
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Mocked for every test file (a vi.mock in a setup file applies to all of them):
// - notify: tests assert on the toast calls instead of rendering sonner
// - logError: keeps the expected failures out of the test output; toAppError stays real
// A file that tests one of these modules itself opts out with vi.unmock('@/lib/notify') / vi.unmock('@/api/errors').
// Mock implementations are reset before each test (vite.config.ts → test.mockReset), so set defaults in beforeEach.
// When mocking an @/api/<module> that api/queries.ts also reads, keep the rest real:
// vi.mock(path, async (importOriginal) => ({ ...(await importOriginal()), fn: vi.fn() })).
vi.mock('@/lib/notify', () => ({
    notify: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock('@/api/errors', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/errors')>()),
    logError: vi.fn(),
}));

// Unmount whatever a test rendered (Vitest runs without globals, so RTL can't register this itself)
afterEach(() => {
    cleanup();
});
