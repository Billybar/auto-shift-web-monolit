import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Employee } from '@/types';
import { updateEmployeeSettings } from '@/api/employees';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import EmployeeSettingsModal from './EmployeeSettingsModal';

vi.mock('@/api/employees', () => ({ updateEmployeeSettings: vi.fn() }));

const saveSettings = vi.mocked(updateEmployeeSettings);

const employee = {
    id: 7,
    location_id: 3,
    color: '3b82f6',
    is_active: true,
    position_ids: [],
    primary_position_id: null,
    user: { first_name: 'דנה', last_name: 'כהן' },
} as unknown as Employee;

function renderModal(shown: Employee = employee) {
    const onClose = vi.fn();
    const { client, wrapper } = createQueryWrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<EmployeeSettingsModal employee={shown} onClose={onClose} />, { wrapper });
    return { onClose, invalidate };
}

describe('EmployeeSettingsModal', () => {
    it('opens as a dialog named after the employee', () => {
        renderModal();
        expect(screen.getByRole('dialog', { name: 'דנה כהן' })).toBeInTheDocument();
    });

    it('saves the settings, then refreshes the employee lists and closes', async () => {
        saveSettings.mockResolvedValue({});
        const { onClose, invalidate } = renderModal();

        await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));

        expect(saveSettings).toHaveBeenCalledWith(7, expect.objectContaining({ max_shifts_per_week: 6 }));
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['employees'] });
        expect(notify.success).toHaveBeenCalledWith('הגדרות המשמרות נשמרו');
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('stays open with the reason when the save fails', async () => {
        saveSettings.mockRejectedValue(new Error('network down'));
        const { onClose, invalidate } = renderModal();

        await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));

        expect(await screen.findByText('שמירת הגדרות המשמרות נכשלה')).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(invalidate).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('shows an empty comment field when the employee has no comment', () => {
        renderModal();
        expect(screen.getByLabelText('הערות (אופציונלי)')).toHaveValue('');
    });

    it('shows the saved comment and saves an edit together with the settings', async () => {
        saveSettings.mockResolvedValue({});
        renderModal({ ...employee, notes: 'מעדיף לילות' });

        const notes = screen.getByLabelText('הערות (אופציונלי)');
        expect(notes).toHaveValue('מעדיף לילות');

        await userEvent.clear(notes);
        await userEvent.type(notes, 'רק בקרים');
        await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));

        expect(saveSettings).toHaveBeenCalledOnce();
        expect(saveSettings).toHaveBeenCalledWith(7, expect.objectContaining({
            notes: 'רק בקרים', max_shifts_per_week: 6,
        }));
    });

    it('closes on Cancel', async () => {
        const { onClose } = renderModal();
        await userEvent.click(screen.getByRole('button', { name: 'ביטול' }));
        expect(onClose).toHaveBeenCalledOnce();
    });
});
