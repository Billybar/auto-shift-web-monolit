import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Employee } from '../../types';
import { updateEmployeeSettings } from '../../api/employees';
import EmployeeSettingsModal from './EmployeeSettingsModal';

vi.mock('../../api/employees', () => ({ updateEmployeeSettings: vi.fn() }));
vi.mock('../../lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() } }));
// Keeps the expected failure out of the test output
vi.mock('../../api/errors', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../api/errors')>()),
    logError: vi.fn(),
}));

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

function renderModal() {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(<EmployeeSettingsModal isOpen employee={employee} onClose={onClose} onSuccess={onSuccess} />);
    return { onClose, onSuccess };
}

describe('EmployeeSettingsModal', () => {
    beforeEach(() => {
        saveSettings.mockReset();
    });

    it('opens as a dialog named after the employee', () => {
        renderModal();
        expect(screen.getByRole('dialog', { name: 'דנה כהן' })).toBeInTheDocument();
    });

    it('saves the settings, then refreshes the parent and closes', async () => {
        saveSettings.mockResolvedValue({});
        const { onClose, onSuccess } = renderModal();

        await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));

        expect(saveSettings).toHaveBeenCalledWith(7, expect.objectContaining({ max_shifts_per_week: 6 }));
        expect(onSuccess).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('stays open with the reason when the save fails', async () => {
        saveSettings.mockRejectedValue(new Error('network down'));
        const { onClose, onSuccess } = renderModal();

        await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));

        expect(await screen.findByText('שמירת הגדרות המשמרות נכשלה')).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(onSuccess).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes on Cancel', async () => {
        const { onClose } = renderModal();
        await userEvent.click(screen.getByRole('button', { name: 'ביטול' }));
        expect(onClose).toHaveBeenCalledOnce();
    });
});
