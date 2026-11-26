import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPosition, deletePosition, updatePosition } from '@/api/positions';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { testPosition } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import PositionsManager from './PositionsManager';

vi.mock('@/api/positions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/positions')>()),
    getPositions: vi.fn(),
    createPosition: vi.fn(),
    updatePosition: vi.fn(),
    deletePosition: vi.fn(),
}));

// In display order (sort_order 0, 1, 2); the third is archived
const POSITIONS = [
    testPosition(1, { sort_order: 0 }),
    testPosition(2, { sort_order: 1 }),
    testPosition(3, { sort_order: 2, is_active: false }),
];

const renderManager = (positions = POSITIONS) =>
    renderWithProviders(<PositionsManager locationId={1} positions={positions} />);

const positionRow = (name: string) => screen.getByDisplayValue(name).closest('li')!;

describe('PositionsManager', () => {
    beforeEach(() => {
        vi.mocked(createPosition).mockResolvedValue(testPosition(4));
        vi.mocked(updatePosition).mockImplementation(async (id) => testPosition(id));
        vi.mocked(deletePosition).mockResolvedValue();
    });

    it('lists the roles in order, marking the archived one', () => {
        renderManager();

        expect(screen.getAllByLabelText('שם התפקיד').map(input => (input as HTMLInputElement).value))
            .toEqual(['role 1', 'role 2', 'role 3']);
        expect(within(positionRow('role 3')).getByText('בארכיון')).toBeInTheDocument();
        expect(within(positionRow('role 1')).queryByText('בארכיון')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'הזזת role 1 למעלה' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'הזזת role 3 למטה' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'הזזת role 2 למעלה' })).toBeEnabled();
    });

    it('says when there are no roles yet', () => {
        renderManager([]);

        expect(screen.getByText('עדיין לא הוגדרו תפקידים')).toBeInTheDocument();
    });

    it('adds a role and clears the form', async () => {
        const { user } = renderManager();
        expect(screen.getByRole('button', { name: 'הוספה' })).toBeDisabled();

        await user.type(screen.getByLabelText('שם התפקיד החדש'), 'אחמ"ש');
        fireEvent.change(screen.getByLabelText('צבע התפקיד החדש'), { target: { value: '#ff0000' } });
        await user.click(screen.getByRole('button', { name: 'הוספה' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('התפקיד נוסף'));
        expect(createPosition).toHaveBeenCalledWith({ location_id: 1, name: 'אחמ"ש', color: 'ff0000' });
        expect(screen.getByLabelText('שם התפקיד החדש')).toHaveValue('');
    });

    it('renames a role on Enter', async () => {
        const { user } = renderManager();
        const name = screen.getByDisplayValue('role 1');

        await user.clear(name);
        await user.type(name, 'מאבטח{Enter}');

        await waitFor(() => expect(updatePosition).toHaveBeenCalledWith(1, { name: 'מאבטח' }));
    });

    it('recolors a role', async () => {
        renderManager();

        fireEvent.change(screen.getByLabelText('צבע role 1'), { target: { value: '#00ff00' } });

        await waitFor(() => expect(updatePosition).toHaveBeenCalledWith(1, { color: '00ff00' }));
    });

    it('archives an active role and restores an archived one', async () => {
        const { user } = renderManager();

        await user.click(within(positionRow('role 1')).getByRole('button', { name: 'העברה לארכיון' }));
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('התפקיד הועבר לארכיון'));
        expect(updatePosition).toHaveBeenCalledWith(1, { is_active: false });

        await user.click(within(positionRow('role 3')).getByRole('button', { name: 'שחזור מהארכיון' }));
        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('התפקיד שוחזר'));
        expect(updatePosition).toHaveBeenCalledWith(3, { is_active: true });
    });

    it('moves a role up, renumbering both', async () => {
        const { user } = renderManager();

        await user.click(screen.getByRole('button', { name: 'הזזת role 2 למעלה' }));

        await waitFor(() => expect(updatePosition).toHaveBeenCalledTimes(2));
        expect(updatePosition).toHaveBeenCalledWith(2, { sort_order: 0 });
        expect(updatePosition).toHaveBeenCalledWith(1, { sort_order: 1 });
    });

    it('deletes a confirmed role', async () => {
        const { user } = renderManager();

        await user.click(within(positionRow('role 1')).getByRole('button', { name: 'מחיקת התפקיד' }));
        await user.click(within(screen.getByRole('alertdialog', { name: 'למחוק את התפקיד "role 1"?' })).getByRole('button', { name: 'מחיקה' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('התפקיד נמחק'));
        expect(deletePosition).toHaveBeenCalledWith(1);
    });

    it('deletes nothing when the delete is cancelled', async () => {
        const { user } = renderManager();

        await user.click(within(positionRow('role 1')).getByRole('button', { name: 'מחיקת התפקיד' }));
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'ביטול' }));

        expect(deletePosition).not.toHaveBeenCalled();
    });

    it('offers to archive a role that is in use instead of deleting it', async () => {
        vi.mocked(deletePosition).mockRejectedValue(apiError(409, 'position_in_use'));
        const { user } = renderManager();

        await user.click(within(positionRow('role 1')).getByRole('button', { name: 'מחיקת התפקיד' }));
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'מחיקה' }));

        const warning = (await screen.findByText('אי אפשר למחוק את התפקיד')).closest('[role="alert"]') as HTMLElement;
        await user.click(within(warning).getByRole('button', { name: 'העברה לארכיון' }));

        await waitFor(() => expect(updatePosition).toHaveBeenCalledWith(1, { is_active: false }));
        await waitFor(() => expect(screen.queryByText('אי אפשר למחוק את התפקיד')).not.toBeInTheDocument());
    });

    it('explains any other failed delete, until dismissed', async () => {
        vi.mocked(deletePosition).mockRejectedValue(apiError(500));
        const { user } = renderManager();

        await user.click(within(positionRow('role 2')).getByRole('button', { name: 'מחיקת התפקיד' }));
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'מחיקה' }));

        const alert = (await screen.findByText('מחיקת התפקיד נכשלה')).closest('[role="alert"]') as HTMLElement;
        expect(alert).toHaveTextContent('אירעה שגיאה בשרת');
        expect(within(alert).queryByRole('button', { name: 'העברה לארכיון' })).not.toBeInTheDocument();

        await user.click(within(alert).getByRole('button', { name: 'סגירה' }));
        expect(screen.queryByText('מחיקת התפקיד נכשלה')).not.toBeInTheDocument();
    });
});
