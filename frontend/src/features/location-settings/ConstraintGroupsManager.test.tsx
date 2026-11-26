import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    getConstraintGroups, mergeConstraintGroups, renameConstraintGroup, splitConstraintGroup,
} from '@/api/constraintGroups';
import { getShiftDefinitions } from '@/api/shiftDefinitions';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { testConstraintGroup, testShift } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import ConstraintGroupsManager from './ConstraintGroupsManager';

vi.mock('@/api/shiftDefinitions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/shiftDefinitions')>()),
    getShiftDefinitions: vi.fn(),
}));

vi.mock('@/api/constraintGroups', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraintGroups')>()),
    getConstraintGroups: vi.fn(),
    renameConstraintGroup: vi.fn(),
    mergeConstraintGroups: vi.fn(),
    splitConstraintGroup: vi.fn(),
}));

// Row 1 holds two morning shifts and has no name; row 2 holds the evening shift and is named
const SHIFTS = [
    testShift(1, { name: 'מאבטח בוקר' }),
    testShift(2, { name: 'אחראי בוקר', constraint_group_id: 1 }),
    testShift(3, { name: 'ערב', start_time: '15:00', end_time: '23:00', category: 'evening', constraint_group_id: 2 }),
];
const MORNINGS = testConstraintGroup(1, { shift_ids: [1, 2] });
const EVENINGS = testConstraintGroup(2, { name: 'שורת ערב', shift_ids: [3] });
const MORNINGS_LABEL = 'מאבטח בוקר / אחראי בוקר';

const renderManager = () => renderWithProviders(<ConstraintGroupsManager locationId={1} />);

/** Picks `option` in the merge menu of the row labelled `label`, then answers the confirm. */
const merge = async (user: ReturnType<typeof renderManager>['user'], label: string, option: string, answer: string) => {
    await user.selectOptions(await screen.findByLabelText(`איחוד שורה אחרת לתוך ${label}`), option);
    const dialog = screen.getByRole('alertdialog', { name: `לאחד את "שורת ערב" לתוך "${MORNINGS_LABEL}"?` });
    await user.click(within(dialog).getByRole('button', { name: answer }));
};

describe('ConstraintGroupsManager', () => {
    beforeEach(() => {
        vi.mocked(getShiftDefinitions).mockResolvedValue(SHIFTS);
        vi.mocked(getConstraintGroups).mockResolvedValue([MORNINGS, EVENINGS]);
        vi.mocked(renameConstraintGroup).mockResolvedValue(MORNINGS);
        vi.mocked(mergeConstraintGroups).mockResolvedValue({ group: MORNINGS, moved: 4, conflicts: 0 });
        vi.mocked(splitConstraintGroup).mockResolvedValue(MORNINGS);
    });

    it('shows each row with its shifts, and split buttons where a row holds more than one', async () => {
        renderManager();

        expect(await screen.findByPlaceholderText(MORNINGS_LABEL)).toHaveValue('');
        expect(screen.getByDisplayValue('שורת ערב')).toBeInTheDocument();
        expect(screen.getByText('ערב · 15:00 - 23:00')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'הפרדת מאבטח בוקר לשורה נפרדת' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'הפרדת ערב לשורה נפרדת' })).not.toBeInTheDocument();
    });

    it('renames a row on Enter', async () => {
        const { user } = renderManager();

        await user.type(await screen.findByPlaceholderText(MORNINGS_LABEL), 'בקרים{Enter}');

        await waitFor(() => expect(renameConstraintGroup).toHaveBeenCalledWith(1, 'בקרים'));
    });

    it('merges a confirmed row into another', async () => {
        const { user } = renderManager();

        await merge(user, MORNINGS_LABEL, '2', 'איחוד');

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('השורות אוחדו'));
        expect(mergeConstraintGroups).toHaveBeenCalledWith(1, 2);
    });

    it('warns when a merge left constraints behind', async () => {
        vi.mocked(mergeConstraintGroups).mockResolvedValue({ group: MORNINGS, moved: 2, conflicts: 3 });
        const { user } = renderManager();

        await merge(user, MORNINGS_LABEL, '2', 'איחוד');

        const warning = (await screen.findByText('השורות אוחדו, אך חלק מהאילוצים לא הועברו')).closest('[role="alert"]') as HTMLElement;
        expect(warning).toHaveTextContent('3 אילוצים מהשורה "שורת ערב" לא הועברו');
        expect(notify.success).not.toHaveBeenCalled();
    });

    it('merges nothing when the merge is cancelled', async () => {
        const { user } = renderManager();

        await merge(user, MORNINGS_LABEL, '2', 'ביטול');

        expect(mergeConstraintGroups).not.toHaveBeenCalled();
    });

    it('splits a confirmed shift out of its row', async () => {
        const { user } = renderManager();

        await user.click(await screen.findByRole('button', { name: 'הפרדת אחראי בוקר לשורה נפרדת' }));
        const dialog = screen.getByRole('alertdialog', { name: 'להפריד את "אחראי בוקר" לשורה נפרדת?' });
        await user.click(within(dialog).getByRole('button', { name: 'הפרדה' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('המשמרת הופרדה לשורה נפרדת'));
        expect(splitConstraintGroup).toHaveBeenCalledWith(1, 2);
    });

    it('shows a failed load with a retry', async () => {
        vi.mocked(getConstraintGroups).mockRejectedValue(apiError(500));
        const { user } = renderManager();

        expect(await screen.findByText('טעינת שורות הלוח נכשלה')).toBeInTheDocument();

        vi.mocked(getConstraintGroups).mockResolvedValue([MORNINGS, EVENINGS]);
        await user.click(screen.getByRole('button', { name: 'נסה שוב' }));

        expect(await screen.findByDisplayValue('שורת ערב')).toBeInTheDocument();
    });

    it('says when the location has no shifts', async () => {
        vi.mocked(getShiftDefinitions).mockResolvedValue([]);
        vi.mocked(getConstraintGroups).mockResolvedValue([]);
        renderManager();

        expect(await screen.findByText('עדיין לא הוגדרו משמרות לאתר זה')).toBeInTheDocument();
    });
});
