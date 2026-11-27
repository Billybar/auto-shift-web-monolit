import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDemoStatus, startDemoSession, switchDemoRole } from '@/api/demo';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { testUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import { UserRole } from '@/types';
import DemoBanner from './DemoBanner';

// queries.ts reads this module's fetchers, so whatever the banner doesn't call stays real
vi.mock('@/api/demo', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/demo')>()),
    getDemoStatus: vi.fn(),
    startDemoSession: vi.fn(),
    switchDemoRole: vi.fn(),
}));

// Mounted on a page other than '/', so going home shows on current-path
const renderBanner = (options: Parameters<typeof renderWithProviders>[1] = {}) =>
    renderWithProviders(<DemoBanner />, { user: testUser(UserRole.MANAGER), route: '/schedule', ...options });

const BANNER_TEXT = 'סביבת הדגמה: הנתונים שלך פרטיים ונמחקים אוטומטית אחרי 24 שעות.';

describe('DemoBanner', () => {
    beforeEach(() => {
        vi.mocked(getDemoStatus).mockResolvedValue({ enabled: true, sandbox_ttl_hours: 24 });
        vi.mocked(startDemoSession).mockResolvedValue({ access_token: 'fresh-token', token_type: 'bearer' });
        vi.mocked(switchDemoRole).mockImplementation(async (role) => ({ access_token: `${role}-token`, token_type: 'bearer' }));
    });

    describe('when it shows', () => {
        it('says how long the sandbox lives', async () => {
            renderBanner();

            expect(await screen.findByText(BANNER_TEXT)).toBeInTheDocument();
        });

        it('shows nothing on a regular instance', async () => {
            vi.mocked(getDemoStatus).mockResolvedValue({ enabled: false, sandbox_ttl_hours: 0 });
            const { client, container } = renderBanner();

            await waitFor(() => expect(getDemoStatus).toHaveBeenCalled());
            await waitFor(() => expect(client.isFetching()).toBe(0));
            expect(container).toBeEmptyDOMElement();
        });

        it('shows nothing when signed out', async () => {
            const { client, container } = renderBanner({ user: null });

            await waitFor(() => expect(client.isFetching()).toBe(0));
            expect(container).toBeEmptyDOMElement();
        });
    });

    describe('switching the view', () => {
        it("switches the manager to an employee's view and opens it", async () => {
            const { user, auth } = renderBanner();

            await user.click(await screen.findByRole('button', { name: 'צפה כעובד' }));

            expect(await screen.findByTestId('current-path')).toHaveTextContent(/^\/$/);
            expect(switchDemoRole).toHaveBeenCalledWith('employee');
            expect(auth.login).toHaveBeenCalledWith('employee-token');
        });

        it("switches an employee back to the manager's view", async () => {
            const { user, auth } = renderBanner({ user: testUser(UserRole.EMPLOYEE) });

            await user.click(await screen.findByRole('button', { name: 'צפה כמנהל' }));

            await waitFor(() => expect(auth.login).toHaveBeenCalledWith('manager-token'));
            expect(switchDemoRole).toHaveBeenCalledWith('manager');
        });

        it('reports a failed switch and stays', async () => {
            const error = apiError(500);
            vi.mocked(switchDemoRole).mockRejectedValue(error);
            const { user, auth } = renderBanner();

            const button = await screen.findByRole('button', { name: 'צפה כעובד' });
            await user.click(button);

            await waitFor(() => expect(notify.error).toHaveBeenCalledWith(error, 'החלפת התצוגה נכשלה'));
            expect(auth.login).not.toHaveBeenCalled();
            expect(button).toBeEnabled();
            expect(screen.queryByTestId('current-path')).not.toBeInTheDocument();
        });
    });

    describe('starting over', () => {
        const confirmRestart = async (user: ReturnType<typeof renderBanner>['user'], choice: string) => {
            await user.click(await screen.findByRole('button', { name: 'התחל מחדש' }));
            const dialog = await screen.findByRole('alertdialog', { name: 'להתחיל מחדש?' });
            await user.click(within(dialog).getByRole('button', { name: choice }));
        };

        it('creates a fresh sandbox once confirmed, and opens it', async () => {
            const { user, auth } = renderBanner();

            await confirmRestart(user, 'התחלה מחדש');

            expect(await screen.findByTestId('current-path')).toHaveTextContent(/^\/$/);
            expect(auth.login).toHaveBeenCalledWith('fresh-token');
            expect(notify.success).toHaveBeenCalledWith('נוצרה סביבת הדגמה חדשה');
        });

        it('starts nothing when cancelled', async () => {
            const { user } = renderBanner();

            await confirmRestart(user, 'ביטול');

            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
            expect(startDemoSession).not.toHaveBeenCalled();
        });

        it('reports a failed restart', async () => {
            const error = apiError(429, 'demo_limit_reached');
            vi.mocked(startDemoSession).mockRejectedValue(error);
            const { user } = renderBanner();

            await confirmRestart(user, 'התחלה מחדש');

            await waitFor(() => expect(notify.error).toHaveBeenCalledWith(error, 'יצירת סביבת הדגמה חדשה נכשלה'));
            expect(notify.success).not.toHaveBeenCalled();
            expect(screen.getByRole('button', { name: 'התחל מחדש' })).toBeEnabled();
        });
    });
});
