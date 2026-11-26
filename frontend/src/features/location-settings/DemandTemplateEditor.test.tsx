import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDemandTemplate, updateDemandTemplate } from '@/api/locations';
import { getShiftDefinitions } from '@/api/shiftDefinitions';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { testPosition, testShift } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { DemandTemplate } from '@/types';
import DemandTemplateEditor from './DemandTemplateEditor';

vi.mock('@/api/locations', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/locations')>()),
    getDemandTemplate: vi.fn(),
    updateDemandTemplate: vi.fn(),
}));

vi.mock('@/api/shiftDefinitions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/shiftDefinitions')>()),
    getShiftDefinitions: vi.fn(),
}));

const POSITIONS = [testPosition(1), testPosition(2)];
// The morning shift needs 2 of role 1 on Mondays
const TEMPLATE: DemandTemplate = {
    location_id: 1,
    cells: [{ shift_id: 1, position_id: 1, day_of_week: 1, required_employees: 2 }],
};

const renderEditor = (positions = POSITIONS) =>
    renderWithProviders(<DemandTemplateEditor locationId={1} positions={positions} />);

const plus = (cell: string) => screen.getByRole('button', { name: `הוספה: ${cell}` });
const minus = (cell: string) => screen.getByRole('button', { name: `הפחתה: ${cell}` });
/** The number shown between the cell's buttons. */
const valueOf = (cell: string) => plus(cell).previousElementSibling!.textContent;

const SUNDAY = 'בוקר, role 1, ראשון';
const MONDAY = 'בוקר, role 1, שני';

describe('DemandTemplateEditor', () => {
    beforeEach(() => {
        vi.mocked(getShiftDefinitions).mockResolvedValue([testShift(1)]);
        vi.mocked(getDemandTemplate).mockResolvedValue(TEMPLATE);
        vi.mocked(updateDemandTemplate).mockImplementation(async (locationId, cells) => ({ location_id: locationId, cells }));
    });

    it('shows the stored template', async () => {
        renderEditor();

        await screen.findByRole('button', { name: `הוספה: ${MONDAY}` });
        expect(valueOf(MONDAY)).toBe('2');
        expect(valueOf(SUNDAY)).toBe('0');
        expect(minus(SUNDAY)).toBeDisabled();
        expect(minus(MONDAY)).toBeEnabled();
        expect(screen.getByRole('button', { name: 'שמירה' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'ביטול שינויים' })).toBeDisabled();
    });

    it('steps a cell once per click and saves the template', async () => {
        const { user } = renderEditor();
        await screen.findByRole('button', { name: `הוספה: ${SUNDAY}` });

        await user.click(plus(SUNDAY));
        expect(valueOf(SUNDAY)).toBe('1');

        await user.click(screen.getByRole('button', { name: 'שמירה' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('התקן השבועי נשמר'));
        const [locationId, cells] = vi.mocked(updateDemandTemplate).mock.calls[0];
        expect(locationId).toBe(1);
        expect(cells).toHaveLength(2);
        expect(cells).toEqual(expect.arrayContaining([
            { shift_id: 1, position_id: 1, day_of_week: 0, required_employees: 1 },
            { shift_id: 1, position_id: 1, day_of_week: 1, required_employees: 2 },
        ]));
        await waitFor(() => expect(screen.getByRole('button', { name: 'שמירה' })).toBeDisabled());
    });

    it('steps once from the keyboard', async () => {
        const { user } = renderEditor();
        await screen.findByRole('button', { name: `הפחתה: ${MONDAY}` });

        minus(MONDAY).focus();
        await user.keyboard('{Enter}');

        expect(valueOf(MONDAY)).toBe('1');
    });

    it('discards the edits', async () => {
        const { user } = renderEditor();
        await screen.findByRole('button', { name: `הוספה: ${MONDAY}` });

        await user.click(plus(MONDAY));
        expect(valueOf(MONDAY)).toBe('3');
        await user.click(screen.getByRole('button', { name: 'ביטול שינויים' }));

        expect(valueOf(MONDAY)).toBe('2');
        expect(updateDemandTemplate).not.toHaveBeenCalled();
    });

    it('explains a failed save and keeps the edits', async () => {
        vi.mocked(updateDemandTemplate).mockRejectedValue(apiError(500));
        const { user } = renderEditor();
        await screen.findByRole('button', { name: `הוספה: ${SUNDAY}` });

        await user.click(plus(SUNDAY));
        await user.click(screen.getByRole('button', { name: 'שמירה' }));

        expect(await screen.findByText('שמירת התקן נכשלה')).toBeInTheDocument();
        expect(valueOf(SUNDAY)).toBe('1');
        expect(notify.success).not.toHaveBeenCalled();
    });

    it('says when the location has no shifts', async () => {
        vi.mocked(getShiftDefinitions).mockResolvedValue([]);
        renderEditor();

        expect(await screen.findByText('לא הוגדרו משמרות לאתר זה.')).toBeInTheDocument();
    });

    it('says when the location has no roles', async () => {
        renderEditor([]);

        expect(await screen.findByText('הוסף תפקיד אחד לפחות בלשונית "תפקידים".')).toBeInTheDocument();
    });

    it('shows a failed load with a retry', async () => {
        vi.mocked(getDemandTemplate).mockRejectedValue(apiError(500));
        const { user } = renderEditor();

        expect(await screen.findByText('טעינת התקן השבועי נכשלה')).toBeInTheDocument();

        vi.mocked(getDemandTemplate).mockResolvedValue(TEMPLATE);
        await user.click(screen.getByRole('button', { name: 'נסה שוב' }));

        expect(await screen.findByRole('button', { name: `הוספה: ${MONDAY}` })).toBeInTheDocument();
    });
});
