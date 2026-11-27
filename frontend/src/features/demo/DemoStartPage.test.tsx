import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDemoStatus, startDemoSession } from '@/api/demo';
import { apiError } from '@/test/apiErrors';
import { renderWithProviders } from '@/test/renderWithProviders';
import DemoStartPage from './DemoStartPage';

// queries.ts reads this module's fetchers, so whatever the page doesn't call stays real
vi.mock('@/api/demo', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/demo')>()),
    getDemoStatus: vi.fn(),
    startDemoSession: vi.fn(),
}));

const setDemoInstance = (enabled: boolean) => vi.mocked(getDemoStatus).mockResolvedValue({ enabled, sandbox_ttl_hours: 24 });

const renderPage = (options: Parameters<typeof renderWithProviders>[1] = {}) =>
    renderWithProviders(<DemoStartPage />, { user: null, route: '/demo', ...options });

const NOT_AVAILABLE = 'סביבת ההדגמה אינה זמינה באתר זה.';

describe('DemoStartPage', () => {
    beforeEach(() => {
        setDemoInstance(true);
        vi.mocked(startDemoSession).mockResolvedValue({ access_token: 'demo-token', token_type: 'bearer' });
    });

    describe('starting', () => {
        it('says the sandbox is being prepared', async () => {
            vi.mocked(startDemoSession).mockReturnValue(new Promise(() => {}));
            renderPage();

            expect(screen.getByText('מכין עבורך סביבת הדגמה עם עובדים, משמרות ואילוצים…')).toBeInTheDocument();
            await waitFor(() => expect(startDemoSession).toHaveBeenCalledOnce());
        });

        it('logs the visitor in to a fresh sandbox and opens the app', async () => {
            const { auth } = renderPage();

            expect(await screen.findByTestId('current-path')).toHaveTextContent(/^\/$/);
            expect(auth.login).toHaveBeenCalledWith('demo-token');
        });

        it('lets a signed-in visitor straight in, without a new sandbox', async () => {
            renderPage({ user: undefined });

            expect(await screen.findByTestId('current-path')).toHaveTextContent(/^\/$/);
            expect(startDemoSession).not.toHaveBeenCalled();
        });

        it('waits for the stored session before deciding', () => {
            renderPage({ authLoading: true });

            expect(startDemoSession).not.toHaveBeenCalled();
            expect(screen.queryByTestId('current-path')).not.toBeInTheDocument();
        });
    });

    describe('failures', () => {
        it('says a regular instance has no demo, and links back to the login', async () => {
            setDemoInstance(false);
            vi.mocked(startDemoSession).mockRejectedValue(apiError(404));
            renderPage();

            expect(await screen.findByText(NOT_AVAILABLE)).toBeInTheDocument();
            expect(await screen.findByRole('link', { name: 'חזרה למסך הכניסה' })).toHaveAttribute('href', '/login');
        });

        it('has no login to link back to on the demo instance', async () => {
            vi.mocked(startDemoSession).mockRejectedValue(apiError(500));
            const { client } = renderPage();

            expect(await screen.findByRole('button', { name: 'נסה שוב' })).toBeInTheDocument();
            await waitFor(() => expect(client.isFetching()).toBe(0));
            expect(screen.queryByRole('link', { name: 'חזרה למסך הכניסה' })).not.toBeInTheDocument();
        });

        it('tries again on "נסה שוב"', async () => {
            vi.mocked(startDemoSession).mockRejectedValueOnce(apiError(500));
            const { user, auth } = renderPage();

            await user.click(await screen.findByRole('button', { name: 'נסה שוב' }));

            expect(await screen.findByTestId('current-path')).toHaveTextContent(/^\/$/);
            expect(startDemoSession).toHaveBeenCalledTimes(2);
            expect(auth.login).toHaveBeenCalledWith('demo-token');
        });
    });
});
