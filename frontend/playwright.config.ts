import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: the real app against a demo-mode backend and a throwaway Postgres.
// Ports 8010 / 5180 / 5434, so a running dev stack (8000 / 5173) and the pytest DB (5433) never clash.
// Needs Docker and the repo's .venv. Run with: npm run e2e  (or npm run e2e -- --ui / --headed)
export default defineConfig({
    testDir: 'e2e',
    fullyParallel: true,
    // Each auto-assign uses 8 solver threads
    workers: 2,
    retries: 0,
    // A test opens a sandbox (the first one per worker also waits for Vite's first compile),
    // then runs whole flows against the real solver: more than the 30 s / 5 s defaults
    timeout: 90_000,
    expect: { timeout: 10_000 },
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:5180',
        locale: 'he-IL',
        timezoneId: 'Asia/Jerusalem',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: [
        {
            command: 'node e2e/backend.mjs',
            url: 'http://127.0.0.1:8010/api/health',
            timeout: 120_000,
            reuseExistingServer: false,
            stdout: 'pipe',
        },
        {
            // --host: plain "localhost" can bind IPv6 only on Windows, and the url above is IPv4
            command: 'npm run dev -- --host 127.0.0.1 --port 5180 --strictPort',
            url: 'http://127.0.0.1:5180',
            timeout: 60_000,
            reuseExistingServer: false,
            env: { E2E_API_TARGET: 'http://127.0.0.1:8010' },
        },
    ],
    globalTeardown: './e2e/teardown.ts',
});
