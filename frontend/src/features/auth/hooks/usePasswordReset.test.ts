import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmPasswordReset, requestPasswordReset } from '@/api/auth';
import { apiError } from '@/test/apiErrors';
import { createQueryWrapper } from '@/test/queryWrapper';
import { usePasswordReset } from './usePasswordReset';

vi.mock('@/api/auth', () => ({ confirmPasswordReset: vi.fn(), requestPasswordReset: vi.fn() }));

const EMAIL = 'dana@example.com';

const renderReset = () => {
    const { wrapper } = createQueryWrapper();
    return renderHook(() => usePasswordReset(), { wrapper });
};

// Renders the hook on the code step
const renderOnCodeStep = async () => {
    const hook = renderReset();
    act(() => hook.result.current.requestCode(EMAIL));
    await vi.waitFor(() => expect(hook.result.current.step).toBe('OTP_INPUT'));
    return hook;
};

describe('usePasswordReset', () => {
    beforeEach(() => {
        vi.mocked(requestPasswordReset).mockResolvedValue({ message: 'sent' });
        vi.mocked(confirmPasswordReset).mockResolvedValue({ message: 'reset' });
    });

    it('asks for an email before sending a code', () => {
        const { result } = renderReset();

        act(() => result.current.requestCode('  '));

        expect(result.current.error).toBe('יש להזין כתובת מייל.');
        expect(requestPasswordReset).not.toHaveBeenCalled();
    });

    it('sends the code, then resets the password with it', async () => {
        const { result } = await renderOnCodeStep();
        expect(requestPasswordReset).toHaveBeenCalledWith({ email: EMAIL });

        act(() => result.current.confirm(EMAIL, '123456', 'new-password'));

        await vi.waitFor(() => expect(result.current.step).toBe('SUCCESS'));
        expect(confirmPasswordReset).toHaveBeenCalledWith({ email: EMAIL, otp: '123456', new_password: 'new-password' });
        expect(result.current.error).toBeNull();
    });

    it('stays on the email step when the code request fails', async () => {
        vi.mocked(requestPasswordReset).mockRejectedValue(apiError(500));
        const { result } = renderReset();

        act(() => result.current.requestCode(EMAIL));

        await vi.waitFor(() => expect(result.current.error).toBe('אירעה שגיאה בשרת. נסה שוב בעוד מספר דקות.'));
        expect(result.current.step).toBe('EMAIL_INPUT');
    });

    it('checks the code and the new password before sending', async () => {
        const { result } = await renderOnCodeStep();

        act(() => result.current.confirm(EMAIL, '123', 'new-password'));
        expect(result.current.error).toBe('הקוד חייב להכיל בדיוק 6 ספרות.');

        act(() => result.current.confirm(EMAIL, '123456', 'short'));
        expect(result.current.error).toBe('הסיסמא חייבת להכיל לפחות 8 תווים');

        expect(confirmPasswordReset).not.toHaveBeenCalled();
    });

    it('says the code is wrong or expired on a 400', async () => {
        vi.mocked(confirmPasswordReset).mockRejectedValue(apiError(400));
        const { result } = await renderOnCodeStep();

        act(() => result.current.confirm(EMAIL, '123456', 'new-password'));

        await vi.waitFor(() => expect(result.current.error).toBe('הקוד שגוי או פג תוקפו.'));
        expect(result.current.step).toBe('OTP_INPUT');
    });
});
