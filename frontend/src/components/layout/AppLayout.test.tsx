import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDemoStatus } from '@/api/demo';
import { testLocation, testUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { ProviderOptions } from '@/test/renderWithProviders';
import { UserRole } from '@/types';
import AppLayout from './AppLayout';

// queries.ts reads the module's fetchers, so the rest stays real
vi.mock('@/api/demo', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/demo')>()),
    getDemoStatus: vi.fn(),
}));

const renderLayout = (options: ProviderOptions = {}) =>
    renderWithProviders(<AppLayout />, { outlet: <p>תוכן העמוד</p>, ...options });

/** Opens the header menu the way a mouse does, by hovering its button. */
const openMenu = async (user: ReturnType<typeof renderLayout>['user']) => {
    await user.hover(screen.getByRole('button', { name: 'תפריט ניווט' }));
    return screen.findByRole('menu');
};

describe('AppLayout', () => {
    beforeEach(() => {
        vi.mocked(getDemoStatus).mockResolvedValue({ enabled: false, sandbox_ttl_hours: 0 });
    });

    it('shows the routed page under the header, titled by the menu', () => {
        renderLayout({ route: '/constraints' });

        expect(screen.getByText('תוכן העמוד')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'אילוצים' })).toBeInTheDocument();
    });

    it('offers an employee only the pages they may open, marking the current one', async () => {
        const { user } = renderLayout({ user: testUser(UserRole.EMPLOYEE) });

        const menu = await openMenu(user);

        const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent);
        expect(items).toEqual(['סידור שבועי', 'אילוצים']);
        expect(screen.getByRole('menuitem', { name: 'סידור שבועי' })).toHaveAttribute('aria-current', 'page');
    });

    it('offers an admin the admin page', async () => {
        const { user } = renderLayout({ user: testUser(UserRole.ADMIN) });

        await openMenu(user);

        expect(screen.getByRole('menuitem', { name: 'ניהול מערכת' })).toBeInTheDocument();
    });

    it('switches the location', async () => {
        const { user } = renderLayout({ locations: [testLocation(1, { name: 'מרכז' }), testLocation(2, { name: 'צפון' })] });
        const select = screen.getByRole('combobox', { name: 'בחירת אתר' });

        await user.selectOptions(select, 'צפון');

        expect(select).toHaveValue('2');
    });

    it("shows the user's name and role in Hebrew", () => {
        renderLayout({ user: testUser(UserRole.SCHEDULER) });

        expect(screen.getByText('דנה כהן')).toBeInTheDocument();
        expect(screen.getByText('סדרן')).toBeInTheDocument();
    });

    it('logs out to the login page', async () => {
        const { user, auth } = renderLayout();

        await user.click(screen.getByRole('button', { name: 'יציאה מהמערכת' }));

        expect(auth.logout).toHaveBeenCalledOnce();
        expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
    });

    it('has no logout on the demo, which has no accounts', async () => {
        vi.mocked(getDemoStatus).mockResolvedValue({ enabled: true, sandbox_ttl_hours: 24 });

        renderLayout();

        // The banner shows once the status is known
        expect(await screen.findByRole('button', { name: 'התחל מחדש' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'יציאה מהמערכת' })).not.toBeInTheDocument();
    });
});
