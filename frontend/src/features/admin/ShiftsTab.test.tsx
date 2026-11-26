import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createShiftDefinition, deleteShiftDefinition, getShiftDefinitions, updateShiftDefinition,
} from '@/api/shiftDefinitions';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { testLocation, testShift } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import ShiftsTab from './ShiftsTab';

// queries.ts reads the module's fetchers, so the rest stays real
vi.mock('@/api/shiftDefinitions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/shiftDefinitions')>()),
    getShiftDefinitions: vi.fn(),
    createShiftDefinition: vi.fn(),
    updateShiftDefinition: vi.fn(),
    deleteShiftDefinition: vi.fn(),
}));

const LOCATION = 3;
const MORNING = testShift(12, { name: 'בוקר', start_time: '07:00', end_time: '15:00', location_id: LOCATION });
const EVENING = testShift(13, { name: 'ערב', start_time: '15:00', end_time: '23:00', location_id: LOCATION, category: 'evening' });

/** Renders the tab and picks the location, so its shifts load. */
const renderTab = async () => {
    const rendered = renderWithProviders(<ShiftsTab locations={[testLocation(LOCATION, { name: 'מרכז' })]} />);
    await rendered.user.selectOptions(screen.getByLabelText('אתר'), String(LOCATION));
    return rendered;
};

const shiftRow = async (name: string) => (await screen.findByText(name)).closest('li')!;

describe('ShiftsTab', () => {
    beforeEach(() => {
        vi.mocked(getShiftDefinitions).mockResolvedValue([MORNING, EVENING]);
        vi.mocked(createShiftDefinition).mockResolvedValue(testShift(14));
        vi.mocked(updateShiftDefinition).mockResolvedValue(MORNING);
        vi.mocked(deleteShiftDefinition).mockResolvedValue();
    });

    it('asks for a location first', () => {
        renderWithProviders(<ShiftsTab locations={[]} />);

        expect(screen.getByText('עדיין אין אתרים. הוסף אתר בלשונית מבנה ארגוני.')).toBeInTheDocument();
    });

    it("lists the picked location's shifts with their hours", async () => {
        await renderTab();

        expect(within(await shiftRow('בוקר')).getByText('07:00 – 15:00')).toBeInTheDocument();
        expect(screen.getByText('ערב')).toBeInTheDocument();
        expect(getShiftDefinitions).toHaveBeenCalledWith(LOCATION);
    });

    it('adds a shift to the location, then clears the form', async () => {
        const { user } = await renderTab();
        await screen.findByText('בוקר');

        await user.type(screen.getByLabelText('שם'), 'לילה');
        await user.type(screen.getByLabelText('שעת התחלה'), '23:00');
        await user.type(screen.getByLabelText('שעת סיום'), '07:00');
        await user.click(screen.getByRole('button', { name: 'הוסף משמרת' }));

        expect(createShiftDefinition).toHaveBeenCalledWith({ name: 'לילה', start_time: '23:00', end_time: '07:00', location_id: LOCATION });
        expect(notify.success).toHaveBeenCalledWith('המשמרת נוספה');
        expect(screen.getByLabelText('שם')).toHaveValue('');
        // The list loads again with the new shift
        await waitFor(() => expect(getShiftDefinitions).toHaveBeenCalledTimes(2));
    });

    it('edits a shift in the same form', async () => {
        const { user } = await renderTab();

        await user.click(within(await shiftRow('בוקר')).getByRole('button', { name: 'עריכה' }));
        expect(screen.getByRole('heading', { name: 'עריכת משמרת' })).toBeInTheDocument();
        expect(screen.getByLabelText('שם')).toHaveValue('בוקר');

        await user.clear(screen.getByLabelText('שם'));
        await user.type(screen.getByLabelText('שם'), 'בוקר מוקדם');
        await user.click(screen.getByRole('button', { name: 'שמור שינויים' }));

        expect(updateShiftDefinition).toHaveBeenCalledWith(12, { name: 'בוקר מוקדם', start_time: '07:00', end_time: '15:00' });
        expect(notify.success).toHaveBeenCalledWith('המשמרת עודכנה');
        expect(screen.getByRole('heading', { name: 'משמרת חדשה' })).toBeInTheDocument();
    });

    it('deletes nothing when the delete is cancelled', async () => {
        const { user } = await renderTab();

        await user.click(within(await shiftRow('ערב')).getByRole('button', { name: 'מחק את המשמרת ערב' }));
        const dialog = screen.getByRole('alertdialog', { name: 'למחוק את המשמרת?' });
        expect(dialog).toHaveTextContent('המחיקה של המשמרת "ערב" סופית');
        await user.click(within(dialog).getByRole('button', { name: 'ביטול' }));

        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(deleteShiftDefinition).not.toHaveBeenCalled();
    });

    it('deletes a confirmed shift, and empties the form when it held that shift', async () => {
        const { user } = await renderTab();
        const row = await shiftRow('בוקר');
        await user.click(within(row).getByRole('button', { name: 'עריכה' }));

        await user.click(within(row).getByRole('button', { name: 'מחק את המשמרת בוקר' }));
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'מחיקה' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('המשמרת נמחקה'));
        expect(vi.mocked(deleteShiftDefinition).mock.calls[0][0]).toBe(12);
        expect(screen.getByRole('heading', { name: 'משמרת חדשה' })).toBeInTheDocument();
        expect(screen.getByLabelText('שם')).toHaveValue('');
    });

    it('explains a refused save inside the form, keeping what was typed', async () => {
        vi.mocked(createShiftDefinition).mockRejectedValue(apiError(400, 'shift_invalid_hours', { shift_name: 'לילה' }));
        const { user } = await renderTab();
        await screen.findByText('בוקר');

        await user.type(screen.getByLabelText('שם'), 'לילה');
        await user.type(screen.getByLabelText('שעת התחלה'), '23:00');
        await user.type(screen.getByLabelText('שעת סיום'), '23:00');
        await user.click(screen.getByRole('button', { name: 'הוסף משמרת' }));

        expect(await screen.findByText('הוספת המשמרת נכשלה')).toBeInTheDocument();
        expect(screen.getByText(/^לשעות של המשמרת "לילה" אין ערך תקין/)).toBeInTheDocument();
        expect(screen.getByLabelText('שם')).toHaveValue('לילה');
        expect(notify.success).not.toHaveBeenCalled();
    });

    it('shows a failed load in place of the list, with a retry', async () => {
        vi.mocked(getShiftDefinitions).mockRejectedValue(apiError(500));
        const { user } = await renderTab();

        expect(await screen.findByText('טעינת המשמרות נכשלה')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'הוסף משמרת' })).not.toBeInTheDocument();

        vi.mocked(getShiftDefinitions).mockResolvedValue([MORNING]);
        await user.click(screen.getByRole('button', { name: 'נסה שוב' }));

        expect(await screen.findByText('בוקר')).toBeInTheDocument();
    });
});
