import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

import { createEmployee, updateEmployee, updateEmployeeSettings } from '@/api/employees';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { Employee, Position } from '@/types';
import { useEmployeeForm } from './useEmployeeForm';

vi.mock('@/api/employees', () => ({
    createEmployee: vi.fn(),
    updateEmployee: vi.fn(),
    updateEmployeeSettings: vi.fn(),
}));
vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// Keeps the expected failures out of the test output
vi.mock('@/api/errors', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/errors')>()),
    logError: vi.fn(),
}));

const LOCATION = 3;
const position = (id: number) => ({ id, name: `role ${id}`, is_active: true }) as Position;
const GUARD = position(10);
const SUPERVISOR = position(20);

const DANA = {
    id: 7,
    location_id: LOCATION,
    color: 'ff0000',
    is_active: true,
    notes: null,
    yalam_id: '111',
    // Role 30 was archived since
    position_ids: [10, 30],
    primary_position_id: 30,
    user: { first_name: 'דנה', last_name: 'כהן', email: 'dana@example.com' },
} as unknown as Employee;

const httpError = (status: number) => new AxiosError('failed', String(status), undefined, undefined, {
    status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: { detail: 'x' },
});

const renderForm = (employee: Employee | null, positions = [GUARD, SUPERVISOR]) => {
    const { client, wrapper } = createQueryWrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(
        ({ emp, isOpen }) => useEmployeeForm(emp, isOpen, positions, LOCATION),
        { wrapper, initialProps: { emp: employee, isOpen: true } },
    );
    return { ...hook, invalidate };
};

describe('useEmployeeForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(updateEmployee).mockResolvedValue(DANA);
        vi.mocked(updateEmployeeSettings).mockResolvedValue({});
        vi.mocked(createEmployee).mockResolvedValue(DANA);
    });

    it("fills the form from the employee, with their active roles only", () => {
        const { result } = renderForm(DANA);
        expect(result.current.values).toMatchObject({
            firstName: 'דנה', email: 'dana@example.com', password: '', yalamId: '111',
            positionIds: [10], primaryPositionId: null,
        });
    });

    it("gives a new employee the location's only role", () => {
        expect(renderForm(null, [GUARD]).result.current.values).toMatchObject({ positionIds: [10], primaryPositionId: 10 });
        expect(renderForm(null).result.current.values).toMatchObject({ positionIds: [], primaryPositionId: null });
    });

    it('drops unsaved edits when the modal opens again', () => {
        const { result, rerender } = renderForm(DANA);
        act(() => result.current.setField('firstName', 'דניאלה'));

        rerender({ emp: DANA, isOpen: false });
        rerender({ emp: DANA, isOpen: true });

        expect(result.current.values.firstName).toBe('דנה');
    });

    it('asks for a password before creating', async () => {
        const { result } = renderForm(null);
        act(() => {
            result.current.setField('firstName', 'רון');
            result.current.setField('lastName', 'לוי');
            result.current.setField('email', 'ron@example.com');
        });

        let saved = true;
        await act(async () => { saved = await result.current.submit(); });

        expect(saved).toBe(false);
        expect(result.current.errors.password).not.toBeNull();
        expect(createEmployee).not.toHaveBeenCalled();
    });

    it('creates an employee with a password, then refreshes the lists', async () => {
        const { result, invalidate } = renderForm(null);
        act(() => {
            result.current.setField('firstName', 'רון');
            result.current.setField('lastName', 'לוי');
            result.current.setField('email', 'ron@example.com');
            result.current.setField('password', 'secret');
            result.current.setField('mishmarotId', '  ');
        });

        let saved = false;
        await act(async () => { saved = await result.current.submit(); });

        expect(saved).toBe(true);
        expect(createEmployee).toHaveBeenCalledWith(expect.objectContaining({
            first_name: 'רון', password: 'secret', location_id: LOCATION, mishmarot_id: null, color: '3B82F6',
        }));
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['employees'] });
        expect(notify.success).toHaveBeenCalledWith('העובד נוסף');
    });

    it('updates the details and the shift limits of an existing employee', async () => {
        const { result } = renderForm(DANA);

        await act(async () => { await result.current.submit(); });

        expect(updateEmployee).toHaveBeenCalledWith(7, expect.objectContaining({ email: 'dana@example.com', position_ids: [10] }));
        expect(updateEmployee).toHaveBeenCalledWith(7, expect.not.objectContaining({ password: expect.anything() }));
        expect(updateEmployeeSettings).toHaveBeenCalledWith(7, expect.objectContaining({ max_shifts_per_week: 6 }));
    });

    it('shows a taken email on the email field, and other failures on the form', async () => {
        vi.mocked(updateEmployee).mockRejectedValueOnce(httpError(409));
        const { result } = renderForm(DANA);

        let saved = true;
        await act(async () => { saved = await result.current.submit(); });
        expect(saved).toBe(false);
        expect(result.current.errors.email).toBe('כתובת המייל כבר קיימת במערכת');

        act(() => result.current.setField('email', 'other@example.com'));
        expect(result.current.errors.email).toBeNull();

        vi.mocked(updateEmployee).mockRejectedValueOnce(httpError(500));
        await act(async () => { await result.current.submit(); });
        expect(result.current.errors.form).not.toBeNull();
    });
});
