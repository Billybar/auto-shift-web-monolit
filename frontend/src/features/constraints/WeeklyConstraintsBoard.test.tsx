import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    getDefaultConstraints, getEmployeeConstraints, saveDefaultConstraints, syncEmployeeConstraints,
} from '@/api/constraints';
import { getConstraintGroups } from '@/api/constraintGroups';
import { getShiftDefinitions } from '@/api/shiftDefinitions';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { testConstraintGroup, testShift } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { ProviderOptions } from '@/test/renderWithProviders';
import type { WeeklyDataResponse } from '@/types';
import WeeklyConstraintsBoard from './WeeklyConstraintsBoard';
import type { WeeklyConstraintsBoardProps } from './WeeklyConstraintsBoard';

vi.mock('@/api/constraints', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraints')>()),
    getEmployeeConstraints: vi.fn(),
    syncEmployeeConstraints: vi.fn(),
    getDefaultConstraints: vi.fn(),
    saveDefaultConstraints: vi.fn(),
}));

vi.mock('@/api/shiftDefinitions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/shiftDefinitions')>()),
    getShiftDefinitions: vi.fn(),
}));

vi.mock('@/api/constraintGroups', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraintGroups')>()),
    getConstraintGroups: vi.fn(),
}));

const SUNDAY = '2026-10-25';
const MONDAY = '2026-10-26';
const SATURDAY = '2026-10-31';

// Row 1 "בוקר" and row 2 "ערב"; the week has one "cannot work" on Sunday morning
const SHIFTS = [testShift(1), testShift(2, { name: 'ערב', start_time: '15:00', end_time: '23:00', category: 'evening' })];
const GROUPS = [testConstraintGroup(1), testConstraintGroup(2)];
const WEEK: WeeklyDataResponse = {
    constraints: [{ id: 1, employee_id: 7, group_id: 1, shift_id: 1, date: SUNDAY, constraint_type: 'cannot_work' }],
    note: null,
    uses_defaults: false,
};

const renderBoard = (props: Partial<WeeklyConstraintsBoardProps> = {}, options: ProviderOptions = {}) => {
    const callbacks = { onCancel: vi.fn(), onSaveSuccess: vi.fn(), onDefaultsSaveSuccess: vi.fn() };
    const rendered = renderWithProviders(
        <WeeklyConstraintsBoard employeeId={7} employeeName="דנה כהן" isManager={false} weekStart={SUNDAY} {...callbacks} {...props} />,
        options,
    );
    return { ...rendered, ...callbacks };
};

/** The cell of the row labelled `label` in column `column` (0 = the first day). */
const cell = async (label: string, column: number) => {
    const row = (await screen.findByText(label)).closest('tr')!;
    return within(row).getAllByRole('button')[column];
};

const saveButton = (name = 'שמור אילוצים') => screen.getByRole('button', { name });

describe('WeeklyConstraintsBoard', () => {
    beforeEach(() => {
        vi.mocked(getEmployeeConstraints).mockResolvedValue(WEEK);
        vi.mocked(syncEmployeeConstraints).mockResolvedValue({ detail: 'ok', saved_constraints_count: 1 });
        vi.mocked(getDefaultConstraints).mockResolvedValue({ employee_id: 7, constraints: [] });
        vi.mocked(saveDefaultConstraints).mockImplementation(async (employeeId, constraints) => ({ employee_id: employeeId, constraints }));
        vi.mocked(getShiftDefinitions).mockResolvedValue(SHIFTS);
        vi.mocked(getConstraintGroups).mockResolvedValue(GROUPS);
    });

    it("shows the week's rows, dates and marks", async () => {
        renderBoard();

        expect(await cell('בוקר', 0)).toHaveTextContent('X לא יכול');
        expect(screen.getByText('07:00 - 15:00')).toBeInTheDocument();
        expect(screen.getByText('15:00 - 23:00')).toBeInTheDocument();
        expect(screen.getByText('25/10/2026')).toBeInTheDocument();
        expect(screen.getByText('31/10/2026')).toBeInTheDocument();
        expect(await cell('ערב', 0)).toHaveTextContent('פנוי');
        expect(screen.getByText(/אילוצים עבור:\s+דנה כהן/)).toBeInTheDocument();
        expect(screen.getByText('לחץ על תא כדי לשנות: פנוי ➔ לא יכול ➔ מעדיף')).toBeInTheDocument();
        expect(getEmployeeConstraints).toHaveBeenCalledWith(7, SUNDAY, SATURDAY);
        // The week is locked, so there is no week picker
        expect(screen.queryByLabelText('תאריך תחילת שבוע')).not.toBeInTheDocument();
    });

    it("steps a cell through an employee's marks", async () => {
        const { user } = renderBoard();
        const monday = await cell('ערב', 1);
        await waitFor(() => expect(monday).toBeEnabled());

        await user.click(monday);
        expect(monday).toHaveTextContent('X לא יכול');
        await user.click(monday);
        expect(monday).toHaveTextContent('♥ מעדיף');
        await user.click(monday);
        expect(monday).toHaveTextContent('פנוי');
    });

    it('adds "must work" for a manager', async () => {
        const { user } = renderBoard({ isManager: true });
        const sunday = await cell('בוקר', 0);
        await waitFor(() => expect(sunday).toBeEnabled());

        expect(screen.getByText('לחץ על תא: פנוי ➔ לא יכול ➔ מעדיף ➔ חייב')).toBeInTheDocument();
        await user.click(sunday);
        await user.click(sunday);

        expect(sunday).toHaveTextContent('V חייב');
    });

    it('saves the week with its note', async () => {
        const { user, onSaveSuccess } = renderBoard();
        const monday = await cell('ערב', 1);
        await waitFor(() => expect(monday).toBeEnabled());

        await user.click(monday);
        await user.type(screen.getByLabelText('הערות לשבוע זה:'), 'חופש ביום שלישי');
        await user.click(saveButton());

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('האילוצים נשמרו'));
        expect(syncEmployeeConstraints).toHaveBeenCalledWith(7, SUNDAY, SATURDAY, {
            constraints: [
                { employee_id: 7, group_id: 1, date: SUNDAY, constraint_type: 'cannot_work' },
                { employee_id: 7, group_id: 2, date: MONDAY, constraint_type: 'cannot_work' },
            ],
            note: 'חופש ביום שלישי',
        });
        expect(onSaveSuccess).toHaveBeenCalledOnce();
    });

    it('says when the week shows the default constraints', async () => {
        vi.mocked(getEmployeeConstraints).mockResolvedValue({ ...WEEK, uses_defaults: true });
        renderBoard();

        expect(await screen.findByText(/^השבוע מולא מהאילוצים הקבועים/)).toBeInTheDocument();
    });

    it('edits and saves the default week', async () => {
        const { user, onDefaultsSaveSuccess, onSaveSuccess } = renderBoard();
        await cell('בוקר', 0);

        await user.click(screen.getByRole('tab', { name: 'אילוצים קבועים' }));

        expect(screen.getByRole('tab', { name: 'אילוצים קבועים' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText(/^האילוצים הקבועים ממלאים כל שבוע/)).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'שלישי' })).toBeInTheDocument();
        expect(screen.queryByLabelText('הערות לשבוע זה:')).not.toBeInTheDocument();

        const tuesday = await cell('בוקר', 2);
        await waitFor(() => expect(tuesday).toBeEnabled());
        await user.click(tuesday);
        await user.click(saveButton('שמור אילוצים קבועים'));

        await waitFor(() => expect(onDefaultsSaveSuccess).toHaveBeenCalledOnce());
        expect(saveDefaultConstraints).toHaveBeenCalledWith(7, [{ group_id: 1, day_of_week: 2, constraint_type: 'cannot_work' }]);
        expect(onSaveSuccess).not.toHaveBeenCalled();

        // Back on the week, its marks are still there
        await user.click(screen.getByRole('tab', { name: 'אילוצים לשבוע' }));
        expect(await cell('בוקר', 0)).toHaveTextContent('X לא יכול');
    });

    it("shows a week that didn't load instead of the grid, and blocks saving", async () => {
        vi.mocked(getEmployeeConstraints).mockRejectedValue(apiError(500));
        const { user } = renderBoard();

        expect(await screen.findByText('טעינת האילוצים נכשלה')).toBeInTheDocument();
        expect(screen.queryByText('בוקר')).not.toBeInTheDocument();
        expect(saveButton()).toBeDisabled();
        expect(screen.getByLabelText('הערות לשבוע זה:')).toBeDisabled();

        vi.mocked(getEmployeeConstraints).mockResolvedValue(WEEK);
        await user.click(screen.getByRole('button', { name: 'נסה שוב' }));

        expect(await cell('בוקר', 0)).toHaveTextContent('X לא יכול');
        await waitFor(() => expect(saveButton()).toBeEnabled());
    });

    it("shows a default week that didn't load", async () => {
        vi.mocked(getDefaultConstraints).mockRejectedValue(apiError(500));
        const { user } = renderBoard();
        await cell('בוקר', 0);

        await user.click(screen.getByRole('tab', { name: 'אילוצים קבועים' }));

        expect(await screen.findByText('טעינת האילוצים הקבועים נכשלה')).toBeInTheDocument();
        expect(saveButton('שמור אילוצים קבועים')).toBeDisabled();
    });

    it("blocks saving when the location's shifts didn't load", async () => {
        vi.mocked(getShiftDefinitions).mockRejectedValue(apiError(500));
        renderBoard();

        expect(await screen.findByText('שגיאה בטעינת סוגי המשמרות. אנא נסה שוב.')).toBeInTheDocument();
        expect(saveButton()).toBeDisabled();
    });

    it('says when the location has no shifts, and blocks saving', async () => {
        vi.mocked(getShiftDefinitions).mockResolvedValue([]);
        renderBoard();

        expect(await screen.findByText('לא הוגדרו משמרות לסניף זה.')).toBeInTheDocument();
        expect(saveButton()).toBeDisabled();
    });

    it('blocks saving without a location', async () => {
        renderBoard({}, { locationId: '' });

        await waitFor(() => expect(getEmployeeConstraints).toHaveBeenCalled());
        expect(getShiftDefinitions).not.toHaveBeenCalled();
        expect(saveButton()).toBeDisabled();
    });

    it('moves to the picked week, and ignores a cleared date', async () => {
        renderBoard({ weekStart: undefined });
        const picker = screen.getByLabelText('תאריך תחילת שבוע');

        fireEvent.change(picker, { target: { value: SUNDAY } });
        await waitFor(() => expect(getEmployeeConstraints).toHaveBeenCalledWith(7, SUNDAY, SATURDAY));
        expect(await screen.findByText('25/10/2026')).toBeInTheDocument();

        fireEvent.change(picker, { target: { value: '' } });
        expect(screen.getByText('25/10/2026')).toBeInTheDocument();
    });

    it('cancels', async () => {
        const { user, onCancel } = renderBoard();

        await user.click(screen.getByRole('button', { name: 'ביטול' }));

        expect(onCancel).toHaveBeenCalledOnce();
    });
});
