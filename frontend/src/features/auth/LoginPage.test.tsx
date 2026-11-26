import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loginUser } from '@/api/auth';
import { getDemoStatus } from '@/api/demo';
import { apiError } from '@/test/apiErrors';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { ProviderOptions } from '@/test/renderWithProviders';
import LoginPage from './LoginPage';

vi.mock('@/api/auth', () => ({ loginUser: vi.fn() }));
// queries.ts reads the module's fetchers, so the rest stays real
vi.mock('@/api/demo', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/demo')>()),
    getDemoStatus: vi.fn(),
}));

const renderLogin = (options: ProviderOptions = {}) => renderWithProviders(<LoginPage />, { user: null, route: '/login', ...options });

describe('LoginPage', () => {
    beforeEach(() => {
        vi.mocked(getDemoStatus).mockResolvedValue({ enabled: false, sandbox_ttl_hours: 0 });
        vi.mocked(loginUser).mockResolvedValue({ access_token: 'token-1', token_type: 'bearer' });
    });

    const signIn = async (user: ReturnType<typeof renderLogin>['user'], password = 'secret') => {
        await user.type(await screen.findByLabelText('מייל'), 'dana@example.com');
        await user.type(screen.getByLabelText('סיסמא'), password);
        await user.click(screen.getByRole('button', { name: 'כניסה' }));
    };

    it('signs in and goes back to the page the user was sent away from', async () => {
        const { user, auth } = renderLogin({ routeState: { from: { pathname: '/admin' } } });

        await signIn(user);

        expect(loginUser).toHaveBeenCalledWith('dana@example.com', 'secret');
        expect(auth.login).toHaveBeenCalledWith('token-1');
        expect(await screen.findByTestId('current-path')).toHaveTextContent('/admin');
    });

    it('goes to the home page after signing in directly', async () => {
        const { user } = renderLogin();

        await signIn(user);

        expect(await screen.findByTestId('current-path')).toHaveTextContent(/^\/$/);
    });

    it('says the credentials are wrong on a 401, and stays on the form', async () => {
        vi.mocked(loginUser).mockRejectedValue(apiError(401));
        const { user, auth } = renderLogin();

        await signIn(user, 'wrong');

        expect(await screen.findByText('אימייל או סיסמה אינם נכונים.')).toBeInTheDocument();
        expect(auth.login).not.toHaveBeenCalled();
        expect(screen.queryByTestId('current-path')).not.toBeInTheDocument();
    });

    it('shows the typed password on request, and hides it again', async () => {
        const { user } = renderLogin();
        const password = await screen.findByLabelText('סיסמא');
        expect(password).toHaveAttribute('type', 'password');

        await user.click(screen.getByRole('button', { name: 'הצג סיסמא' }));
        expect(password).toHaveAttribute('type', 'text');

        await user.click(screen.getByRole('button', { name: 'הסתר סיסמא' }));
        expect(password).toHaveAttribute('type', 'password');
    });

    it('sends visitors of the demo instance, which has no accounts, to the demo', async () => {
        vi.mocked(getDemoStatus).mockResolvedValue({ enabled: true, sandbox_ttl_hours: 24 });

        renderLogin();

        expect(await screen.findByTestId('current-path')).toHaveTextContent('/demo');
    });

    it('shows nothing until it knows whether this is the demo, so the form never flashes by', () => {
        vi.mocked(getDemoStatus).mockReturnValue(new Promise(() => {}));

        renderLogin();

        expect(screen.queryByLabelText('מייל')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'כניסה' })).not.toBeInTheDocument();
    });
});
