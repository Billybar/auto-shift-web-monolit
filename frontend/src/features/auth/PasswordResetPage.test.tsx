import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmPasswordReset, requestPasswordReset } from '@/api/auth';
import { apiError, networkError } from '@/test/apiErrors';
import { renderWithProviders } from '@/test/renderWithProviders';
import PasswordResetPage from './PasswordResetPage';

vi.mock('@/api/auth', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/auth')>()),
    requestPasswordReset: vi.fn(),
    confirmPasswordReset: vi.fn(),
}));

const EMAIL = 'dana@example.com';

const renderPage = () => renderWithProviders(<PasswordResetPage />, { user: null, route: '/reset-password' });

/** Sends the email and waits for the code step. */
const requestCode = async (user: ReturnType<typeof renderPage>['user']) => {
    await user.type(screen.getByLabelText('כתובת מייל'), EMAIL);
    await user.click(screen.getByRole('button', { name: 'שלח קוד' }));
    await screen.findByText('הזן את הקוד שנשלח למייל שלך');
};

describe('PasswordResetPage', () => {
    beforeEach(() => {
        vi.mocked(requestPasswordReset).mockResolvedValue({ message: 'ok' });
        vi.mocked(confirmPasswordReset).mockResolvedValue({ message: 'ok' });
    });

    it('sends a code to the email and asks for it', async () => {
        const { user } = renderPage();
        expect(screen.getByText('איפוס סיסמא')).toBeInTheDocument();

        await requestCode(user);

        expect(requestPasswordReset).toHaveBeenCalledWith({ email: EMAIL });
        expect(screen.getByLabelText('קוד אימות')).toBeInTheDocument();
        expect(screen.queryByLabelText('כתובת מייל')).not.toBeInTheDocument();
    });

    it('stays on the email step when the request fails', async () => {
        vi.mocked(requestPasswordReset).mockRejectedValue(networkError());
        const { user } = renderPage();

        await user.type(screen.getByLabelText('כתובת מייל'), EMAIL);
        await user.click(screen.getByRole('button', { name: 'שלח קוד' }));

        expect(await screen.findByText('לא ניתן להתחבר לשרת. בדוק את החיבור לאינטרנט ונסה שוב.')).toBeInTheDocument();
        expect(screen.getByLabelText('כתובת מייל')).toBeInTheDocument();
    });

    it('keeps only digits in the code', async () => {
        const { user } = renderPage();
        await requestCode(user);

        await user.type(screen.getByLabelText('קוד אימות'), '1a2-3');

        expect(screen.getByLabelText('קוד אימות')).toHaveValue('123');
    });

    it('refuses a code that is not 6 digits, without sending it', async () => {
        const { user } = renderPage();
        await requestCode(user);

        await user.type(screen.getByLabelText('קוד אימות'), '123');
        await user.type(screen.getByLabelText('סיסמא חדשה'), 'newpass123');
        await user.click(screen.getByRole('button', { name: 'איפוס סיסמא' }));

        expect(screen.getByText('הקוד חייב להכיל בדיוק 6 ספרות.')).toBeInTheDocument();
        expect(confirmPasswordReset).not.toHaveBeenCalled();
    });

    it('explains a wrong or expired code', async () => {
        vi.mocked(confirmPasswordReset).mockRejectedValue(apiError(400));
        const { user } = renderPage();
        await requestCode(user);

        await user.type(screen.getByLabelText('קוד אימות'), '123456');
        await user.type(screen.getByLabelText('סיסמא חדשה'), 'newpass123');
        await user.click(screen.getByRole('button', { name: 'איפוס סיסמא' }));

        expect(await screen.findByText('הקוד שגוי או פג תוקפו.')).toBeInTheDocument();
        expect(screen.getByLabelText('קוד אימות')).toHaveValue('123456');
    });

    it('resets the password and leads to the login', async () => {
        const { user } = renderPage();
        await requestCode(user);

        await user.type(screen.getByLabelText('קוד אימות'), '123456');
        await user.type(screen.getByLabelText('סיסמא חדשה'), 'newpass123');
        await user.click(screen.getByRole('button', { name: 'איפוס סיסמא' }));

        expect(await screen.findByText('סיסמא אופסה בהצלחה')).toBeInTheDocument();
        expect(confirmPasswordReset).toHaveBeenCalledWith({ email: EMAIL, otp: '123456', new_password: 'newpass123' });

        await user.click(screen.getByRole('button', { name: 'להתחברות' }));
        await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/login'));
    });

    it('goes back to the login from the first step', async () => {
        const { user } = renderPage();

        await user.click(screen.getByRole('button', { name: 'חזרה להתחברות' }));

        expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
    });
});
