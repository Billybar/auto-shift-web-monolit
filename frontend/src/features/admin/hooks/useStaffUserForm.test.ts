import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

import { createStaffUser, updateStaffUser } from '@/api/admin';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import { UserRole } from '@/types';
import type { Client, LocationData, StaffUser } from '@/types';
import { useStaffUserForm } from './useStaffUserForm';

// queries.ts reads the module's list fetchers, so they stay real
vi.mock('@/api/admin', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/admin')>()),
    createStaffUser: vi.fn(),
    updateStaffUser: vi.fn(),
}));
vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// Keeps the expected failures out of the test output
vi.mock('@/api/errors', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/errors')>()),
    logError: vi.fn(),
}));

// Organization 1 has client 10 (site 100); organization 2 has client 20 (site 200)
const CLIENTS = [{ id: 10, name: 'C10', organization_id: 1 }, { id: 20, name: 'C20', organization_id: 2 }] as Client[];
const LOCATIONS: LocationData[] = [{ id: 100, name: 'S100', client_id: 10 }, { id: 200, name: 'S200', client_id: 20 }];

const RON = {
    id: 7, first_name: 'רון', last_name: 'לוי', email: 'ron@example.com', role: UserRole.SCHEDULER,
    organization_id: 1, employee_id: null, clients: [{ id: 10, name: 'C10' }], locations: [],
} as unknown as StaffUser;

const codedError = (status: number, code: string) => new AxiosError('failed', String(status), undefined, undefined, {
    status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: { detail: 'x', code },
});

const renderForm = (user?: StaffUser) => {
    const { client, wrapper } = createQueryWrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    return { ...renderHook(() => useStaffUserForm(user, CLIENTS, LOCATIONS), { wrapper }), invalidate };
};

type Form = ReturnType<typeof useStaffUserForm>;
const fillNewUser = (form: Form) => {
    form.setField('firstName', ' דנה ');
    form.setField('lastName', 'כהן');
    form.setField('email', 'dana@example.com');
    form.setField('password', 'secret123');
};

describe('useStaffUserForm', () => {
    beforeEach(() => {
        // clearAllMocks keeps implementations, so a failure set by one test would leak into the next
        vi.clearAllMocks();
        vi.mocked(createStaffUser).mockResolvedValue(RON);
        vi.mocked(updateStaffUser).mockResolvedValue(RON);
    });

    it("starts from the user's values and lists only their organization's clients and sites", () => {
        const { result } = renderForm(RON);

        expect(result.current.isEditMode).toBe(true);
        expect(result.current.values).toMatchObject({ firstName: 'רון', role: UserRole.SCHEDULER, organizationId: 1, clientIds: [10] });
        expect(result.current.organizationClients.map(c => c.id)).toEqual([10]);
        expect(result.current.organizationLocations.map(l => l.id)).toEqual([100]);
    });

    it("clears the picked clients and sites when the organization changes", () => {
        const { result } = renderForm(RON);

        act(() => result.current.changeOrganization(2));

        expect(result.current.values).toMatchObject({ organizationId: 2, clientIds: [], locationIds: [] });
        expect(result.current.organizationClients.map(c => c.id)).toEqual([20]);
    });

    it('creates a manager with a trimmed name and their scope, then refreshes the list', async () => {
        const { result, invalidate } = renderForm();
        act(() => {
            fillNewUser(result.current);
            result.current.changeOrganization(1);
        });
        act(() => result.current.toggleLocation(100));

        let saved = false;
        await act(async () => { saved = await result.current.submit(); });

        expect(saved).toBe(true);
        expect(createStaffUser).toHaveBeenCalledWith({
            first_name: 'דנה', last_name: 'כהן', email: 'dana@example.com', password: 'secret123',
            role: UserRole.MANAGER, organization_id: 1, client_ids: [], location_ids: [100],
        });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'staffUsers'] });
        expect(notify.success).toHaveBeenCalledWith('המשתמש נוסף');
    });

    it('sends an admin with no organization and an empty scope', async () => {
        const { result } = renderForm(RON);
        act(() => result.current.setField('role', UserRole.ADMIN));

        await act(() => result.current.submit());

        expect(updateStaffUser).toHaveBeenCalledWith(7, expect.objectContaining({
            role: UserRole.ADMIN, organization_id: null, client_ids: [], location_ids: [],
        }));
        expect(notify.success).toHaveBeenCalledWith('המשתמש עודכן');
    });

    it('refuses a short password until it is retyped', async () => {
        const { result } = renderForm();
        act(() => fillNewUser(result.current));
        act(() => result.current.setField('password', 'short'));

        let saved = true;
        await act(async () => { saved = await result.current.submit(); });

        expect(saved).toBe(false);
        expect(result.current.errors.password).toBe('הסיסמא חייבת להכיל לפחות 8 תווים');
        expect(createStaffUser).not.toHaveBeenCalled();

        act(() => result.current.setField('password', 'longer-one'));
        expect(result.current.errors.password).toBeNull();
    });

    it('refuses a manager without an organization and a client or site', async () => {
        const { result } = renderForm();
        act(() => fillNewUser(result.current));

        await act(() => result.current.submit());

        expect(result.current.errors.form).toBe('יש לבחור ארגון ולפחות לקוח או אתר אחד');
        expect(createStaffUser).not.toHaveBeenCalled();
    });

    it('shows a taken email on the email field until it is retyped', async () => {
        vi.mocked(updateStaffUser).mockRejectedValue(codedError(409, 'email_taken'));
        const { result, invalidate } = renderForm(RON);

        let saved = true;
        await act(async () => { saved = await result.current.submit(); });

        expect(saved).toBe(false);
        // The mutation's error state lands on a later tick
        await vi.waitFor(() => expect(result.current.errors).toEqual({ email: 'כתובת המייל כבר קיימת במערכת', password: null, form: null }));
        expect(invalidate).not.toHaveBeenCalled();

        act(() => result.current.setField('email', 'ron2@example.com'));
        await vi.waitFor(() => expect(result.current.errors.email).toBeNull());
    });

    it('shows any other failure on the form', async () => {
        vi.mocked(updateStaffUser).mockRejectedValue(codedError(400, 'user_scope_invalid'));
        const { result } = renderForm(RON);

        await act(() => result.current.submit());

        await vi.waitFor(() => expect(result.current.errors.form).toMatch(/ההרשאות שנבחרו אינן תקינות/));
        expect(result.current.errors.email).toBeNull();
    });
});
