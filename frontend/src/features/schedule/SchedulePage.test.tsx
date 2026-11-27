import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    checkSchedule, getAssignments, getSchedulePublication, saveAssignments, setSchedulePublication,
} from '@/api/assignments';
import { getConstraintGroups } from '@/api/constraintGroups';
import { getConstraintSubmissionStatus, getDefaultConstraints, getEmployeeConstraints } from '@/api/constraints';
import { getEmployeesByLocation } from '@/api/employees';
import { logError } from '@/api/errors';
import { getLocationWeights, updateLocationWeights } from '@/api/locations';
import { getPositions } from '@/api/positions';
import { getShiftDefinitions, getWeeklyDemand } from '@/api/shiftDefinitions';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { testConstraintGroup, testEmployee, testLocation, testPosition, testShift, testUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import { UserRole } from '@/types';
import type { Assignment, LocationWeights, ScheduleViolation } from '@/types';
import SchedulePage from './SchedulePage';

// queries.ts reads these modules' fetchers, so whatever the page doesn't call stays real
vi.mock('@/api/assignments', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/assignments')>()),
    getAssignments: vi.fn(),
    saveAssignments: vi.fn(),
    checkSchedule: vi.fn(),
    getSchedulePublication: vi.fn(),
    setSchedulePublication: vi.fn(),
}));
vi.mock('@/api/shiftDefinitions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/shiftDefinitions')>()),
    getShiftDefinitions: vi.fn(),
    getWeeklyDemand: vi.fn(),
}));
vi.mock('@/api/positions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/positions')>()),
    getPositions: vi.fn(),
}));
vi.mock('@/api/employees', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/employees')>()),
    getEmployeesByLocation: vi.fn(),
}));
vi.mock('@/api/locations', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/locations')>()),
    getLocationWeights: vi.fn(),
    updateLocationWeights: vi.fn(),
}));
vi.mock('@/api/constraints', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraints')>()),
    getConstraintSubmissionStatus: vi.fn(),
    // The constraints popup's board
    getEmployeeConstraints: vi.fn(),
    getDefaultConstraints: vi.fn(),
}));
vi.mock('@/api/constraintGroups', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraintGroups')>()),
    getConstraintGroups: vi.fn(),
}));

const LOCATION = 3;
const GUARD = testPosition(5, { name: 'מאבטח', location_id: LOCATION });
const MORNING = testShift(1, { location_id: LOCATION });
const DANA = testEmployee(9, { location_id: LOCATION, position_ids: [GUARD.id], primary_position_id: GUARD.id });

/** The week's one saved assignment. */
const savedShift = (date: string): Assignment => ({ employee_id: DANA.id, shift_id: MORNING.id, position_id: GUARD.id, date });

const WEIGHTS: LocationWeights = {
    target_shifts: 1, rest_gap: 2, two_rest_gaps: 3, consecutive_nights: 4, two_consecutive_nights: 5,
    max_nights: 6, max_mornings: 7, max_evenings: 8, min_nights: 9, min_mornings: 10, min_evenings: 11,
    secondary_position: 12, prefer_to: 13,
};

const MAX_SHIFTS: ScheduleViolation = { code: 'max_shifts', employee_id: DANA.id, cells: [], count: 7, limit: 6 };

const setPublished = (isPublished: boolean) => vi.mocked(getSchedulePublication).mockImplementation(async (locationId, week) => ({
    location_id: locationId, week_start_date: week, is_published: isPublished,
}));

const renderPage = (role: UserRole = UserRole.SCHEDULER, options: Parameters<typeof renderWithProviders>[1] = {}) =>
    renderWithProviders(<SchedulePage />, { user: testUser(role), locations: [testLocation(LOCATION)], ...options });

/** The week on screen and what the page loaded for it. */
const loadedWeek = () => {
    const [, startDate, endDate] = vi.mocked(getAssignments).mock.calls.find(([, start, end]) => start !== end)!;
    return { startDate, endDate, assignments: [savedShift(startDate)] };
};

/** Opens the confirm dialog of a toolbar action, once the board has loaded. */
const openConfirm = async (user: ReturnType<typeof renderPage>['user'], action: string) => {
    await user.click(await screen.findByRole('button', { name: action }));
    return screen.findByRole('alertdialog');
};

describe('SchedulePage', () => {
    beforeEach(() => {
        vi.mocked(getShiftDefinitions).mockResolvedValue([MORNING]);
        vi.mocked(getPositions).mockResolvedValue([GUARD]);
        vi.mocked(getEmployeesByLocation).mockResolvedValue([DANA]);
        // The week has one shift; the Saturday before it is empty
        vi.mocked(getAssignments).mockImplementation(async (_location, start, end) => (start === end ? [] : [savedShift(start)]));
        vi.mocked(getWeeklyDemand).mockResolvedValue([]);
        vi.mocked(getLocationWeights).mockResolvedValue(WEIGHTS);
        vi.mocked(updateLocationWeights).mockImplementation(async (_location, weights) => weights);
        vi.mocked(getEmployeeConstraints).mockResolvedValue({ constraints: [], note: null, uses_defaults: false });
        vi.mocked(getDefaultConstraints).mockResolvedValue({ employee_id: DANA.id, constraints: [] });
        vi.mocked(getConstraintGroups).mockResolvedValue([testConstraintGroup(MORNING.id, { location_id: LOCATION })]);
        vi.mocked(getConstraintSubmissionStatus).mockResolvedValue({ week_start: '', pending_employee_ids: [] });
        setPublished(false);
        vi.mocked(saveAssignments).mockResolvedValue({ added: 1, updated: 0, removed: 0, unchanged: 2 });
        vi.mocked(checkSchedule).mockResolvedValue({ violations: [] });
        vi.mocked(setSchedulePublication).mockImplementation(async (locationId, week, isPublished) => ({
            location_id: locationId, week_start_date: week, is_published: isPublished,
        }));
    });

    describe('save', () => {
        it('saves the board as a draft once confirmed, and reports what changed', async () => {
            const { user } = renderPage();

            const dialog = await openConfirm(user, 'שמירה');
            expect(dialog).toHaveAccessibleName('לשמור את השינויים כטיוטה?');
            expect(dialog).toHaveTextContent('העובדים לא יראו אותו עד שיפורסם');
            await user.click(within(dialog).getByRole('button', { name: 'שמירה' }));

            const { startDate, endDate, assignments } = loadedWeek();
            await waitFor(() => expect(notify.success).toHaveBeenCalledWith('הסידור נשמר', 'נוספו: 1 · עודכנו: 0 · הוסרו: 0 · ללא שינוי: 2'));
            expect(saveAssignments).toHaveBeenCalledWith(LOCATION, startDate, endDate, assignments);
        });

        it('warns that a published week changes for the employees at once', async () => {
            setPublished(true);
            const { user } = renderPage();

            const dialog = await openConfirm(user, 'שמירה');

            expect(dialog).toHaveAccessibleName('לשמור את השינויים?');
            expect(dialog).toHaveTextContent('השבוע כבר מפורסם');
        });

        it('saves nothing when cancelled', async () => {
            const { user } = renderPage();

            await user.click(within(await openConfirm(user, 'שמירה')).getByRole('button', { name: 'ביטול' }));

            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
            expect(saveAssignments).not.toHaveBeenCalled();
        });

        it('reports a failed save with a toast', async () => {
            const error = apiError(409, 'schedule_concurrent_edit');
            vi.mocked(saveAssignments).mockRejectedValue(error);
            const { user } = renderPage();

            await user.click(within(await openConfirm(user, 'שמירה')).getByRole('button', { name: 'שמירה' }));

            await waitFor(() => expect(notify.error).toHaveBeenCalledWith(error, 'שמירת הסידור נכשלה'));
            expect(notify.success).not.toHaveBeenCalled();
        });
    });

    describe('publish', () => {
        it('checks the board, then saves it without a toast and publishes it', async () => {
            const { user } = renderPage();

            const dialog = await openConfirm(user, 'פרסום');
            expect(dialog).toHaveAccessibleName('לפרסם את הסידור?');
            await user.click(within(dialog).getByRole('button', { name: 'פרסום' }));

            const { startDate, endDate, assignments } = loadedWeek();
            await waitFor(() => expect(notify.success).toHaveBeenCalledWith('הסידור פורסם לעובדים'));
            expect(checkSchedule).toHaveBeenCalledWith(LOCATION, startDate, assignments);
            expect(saveAssignments).toHaveBeenCalledWith(LOCATION, startDate, endDate, assignments);
            expect(setSchedulePublication).toHaveBeenCalledWith(LOCATION, startDate, true);
            expect(notify.success).not.toHaveBeenCalledWith('הסידור נשמר', expect.anything());
            expect(await screen.findByText('פורסם')).toBeInTheDocument();
        });

        it('names the broken rules before publishing anyway', async () => {
            vi.mocked(checkSchedule).mockResolvedValue({ violations: [MAX_SHIFTS] });
            const { user } = renderPage();

            const dialog = await openConfirm(user, 'פרסום');
            expect(dialog).toHaveAccessibleName('לפרסם למרות ההפרות?');
            expect(dialog).toHaveTextContent('נמצאו 1 הפרות של כללים קשיחים');
            await user.click(within(dialog).getByRole('button', { name: 'פרסום בכל זאת' }));

            await waitFor(() => expect(setSchedulePublication).toHaveBeenCalledWith(LOCATION, loadedWeek().startDate, true));
        });

        it('saves and publishes nothing when cancelled', async () => {
            const { user } = renderPage();

            await user.click(within(await openConfirm(user, 'פרסום')).getByRole('button', { name: 'ביטול' }));

            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
            expect(saveAssignments).not.toHaveBeenCalled();
            expect(setSchedulePublication).not.toHaveBeenCalled();
        });

        it("doesn't publish a board that failed to save", async () => {
            const error = apiError(500);
            vi.mocked(saveAssignments).mockRejectedValue(error);
            const { user } = renderPage();

            await user.click(within(await openConfirm(user, 'פרסום')).getByRole('button', { name: 'פרסום' }));

            await waitFor(() => expect(notify.error).toHaveBeenCalledWith(error, 'שמירת הסידור נכשלה'));
            expect(setSchedulePublication).not.toHaveBeenCalled();
        });
    });

    describe('for an employee', () => {
        it('shows the published week without any editing actions', async () => {
            setPublished(true);
            renderPage(UserRole.EMPLOYEE);

            // The toolbar shows once the week has loaded; for an employee it has only the week navigation
            expect(await screen.findByTitle('שבוע הבא')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'שמירה' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'פרסום' })).not.toBeInTheDocument();
            expect(screen.queryByText('הסידור לשבוע זה טרם פורסם')).not.toBeInTheDocument();
        });

        it('says when the week is not published yet', async () => {
            renderPage(UserRole.EMPLOYEE);

            expect(await screen.findByText('הסידור לשבוע זה טרם פורסם')).toBeInTheDocument();
        });
    });

    describe('page states', () => {
        it('asks for a site when none is selected', () => {
            renderPage(UserRole.SCHEDULER, { locationId: '' });

            expect(screen.getByText('בחר אתר על מנת לראות סידור')).toBeInTheDocument();
            expect(getAssignments).not.toHaveBeenCalled();
        });

        it("shows an error instead of a board that can't be saved, and reloads it", async () => {
            vi.mocked(getShiftDefinitions).mockRejectedValue(apiError(500));
            const { user } = renderPage();

            expect(await screen.findByText('טעינת הסידור נכשלה')).toBeInTheDocument();
            // Week navigation stays; editing goes
            expect(screen.getByTitle('שבוע הבא')).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'שמירה' })).not.toBeInTheDocument();
            expect(screen.queryByRole('heading', { name: 'עובדים' })).not.toBeInTheDocument();

            vi.mocked(getShiftDefinitions).mockResolvedValue([MORNING]);
            await user.click(screen.getByRole('button', { name: 'נסה שוב' }));

            expect(await screen.findByRole('button', { name: 'שמירה' })).toBeInTheDocument();
            expect(screen.queryByText('טעינת הסידור נכשלה')).not.toBeInTheDocument();
        });
    });

    describe('check', () => {
        it('says when the board breaks no rule', async () => {
            const { user } = renderPage();

            await user.click(await screen.findByRole('button', { name: 'בדיקת סידור' }));

            await waitFor(() => expect(notify.success).toHaveBeenCalledWith('לא נמצאו הפרות', 'הסידור עומד בכל הכללים הקשיחים.'));
            const { startDate, assignments } = loadedWeek();
            expect(checkSchedule).toHaveBeenCalledWith(LOCATION, startDate, assignments);
        });

        it('lists the broken rules above the board until dismissed', async () => {
            vi.mocked(checkSchedule).mockResolvedValue({ violations: [MAX_SHIFTS] });
            const { user } = renderPage();

            await user.click(await screen.findByRole('button', { name: 'בדיקת סידור' }));

            const title = await screen.findByText('נמצאו 1 הפרות של כללים קשיחים');
            expect(notify.success).not.toHaveBeenCalled();
            await user.click(screen.getByRole('button', { name: 'סגירה' }));
            expect(title).not.toBeInTheDocument();
        });

        it('reports a failed check with a toast', async () => {
            const error = apiError(500);
            vi.mocked(checkSchedule).mockRejectedValue(error);
            const { user } = renderPage();

            await user.click(await screen.findByRole('button', { name: 'בדיקת סידור' }));

            await waitFor(() => expect(notify.error).toHaveBeenCalledWith(error, 'בדיקת הסידור נכשלה'));
        });
    });

    describe('publish when the check fails', () => {
        it('logs the failure and still asks to publish', async () => {
            const error = apiError(500);
            vi.mocked(checkSchedule).mockRejectedValue(error);
            const { user } = renderPage();

            const dialog = await openConfirm(user, 'פרסום');

            expect(dialog).toHaveAccessibleName('לפרסם את הסידור?');
            expect(logError).toHaveBeenCalledWith('Schedule check before publish failed:', error);
        });
    });

    describe('unpublish', () => {
        beforeEach(() => setPublished(true));

        it('returns the week to a draft once confirmed', async () => {
            const { user } = renderPage();

            const dialog = await openConfirm(user, 'ביטול פרסום');
            expect(dialog).toHaveAccessibleName('להחזיר את הסידור למצב טיוטה?');
            await user.click(within(dialog).getByRole('button', { name: 'החזרה לטיוטה' }));

            await waitFor(() => expect(setSchedulePublication).toHaveBeenCalledWith(LOCATION, loadedWeek().startDate, false));
            expect(await screen.findByText('טיוטה')).toBeInTheDocument();
        });

        it('changes nothing when cancelled', async () => {
            const { user } = renderPage();

            await user.click(within(await openConfirm(user, 'ביטול פרסום')).getByRole('button', { name: 'ביטול' }));

            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
            expect(setSchedulePublication).not.toHaveBeenCalled();
            expect(screen.getByText('פורסם')).toBeInTheDocument();
        });
    });

    describe('auto-assign', () => {
        it('points to the weekly template when the week has no demand, until dismissed', async () => {
            const { user } = renderPage();

            await user.click(await screen.findByRole('button', { name: 'שיבוץ אוטומטי' }));

            const title = await screen.findByText('לא הוגדר תקן לשבוע זה');
            await user.click(screen.getByRole('button', { name: 'סגירה' }));
            expect(title).not.toBeInTheDocument();
        });
    });

    describe('the weights dialog', () => {
        beforeEach(() => {
            // The Radix Slider measures its thumb; jsdom has no ResizeObserver
            vi.stubGlobal('ResizeObserver', class {
                observe() {}
                unobserve() {}
                disconnect() {}
            });
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        /** Opens the dialog once the weights have loaded. */
        const openWeights = async (user: ReturnType<typeof renderPage>['user']) => {
            const button = await screen.findByRole('button', { name: 'כיוונון השיבוץ' });
            await waitFor(() => expect(button).toBeEnabled());
            await user.click(button);
            return screen.findByRole('dialog', { name: 'כיוונון השיבוץ' });
        };

        it("saves the location's weights", async () => {
            const { user } = renderPage();

            const dialog = await openWeights(user);
            await user.click(within(dialog).getByRole('button', { name: 'שמור' }));

            await waitFor(() => expect(notify.success).toHaveBeenCalledWith('משקלי השיבוץ נשמרו'));
            expect(updateLocationWeights).toHaveBeenCalledWith(LOCATION, WEIGHTS);
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('closes without saving on cancel', async () => {
            const { user } = renderPage();

            const dialog = await openWeights(user);
            await user.click(within(dialog).getByRole('button', { name: 'ביטול' }));

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(updateLocationWeights).not.toHaveBeenCalled();
        });
    });

    describe('popups from the sidebar', () => {
        it("opens the employee's settings, and closes them", async () => {
            const { user } = renderPage();

            await user.click(await screen.findByRole('button', { name: 'ערוך משמרות והעדפות עובד' }));
            const dialog = await screen.findByRole('dialog', { name: 'עובד 9' });
            await user.click(within(dialog).getByRole('button', { name: 'ביטול' }));

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it("opens the employee's constraints for the week, and closes them", async () => {
            const { user } = renderPage();

            await user.click(await screen.findByRole('button', { name: 'לחיצה לעריכת אילוצים: עובד 9' }));
            const dialog = await screen.findByRole('dialog', { name: 'האילוצים של עובד 9' });
            const { startDate, endDate } = loadedWeek();
            await waitFor(() => expect(getEmployeeConstraints).toHaveBeenCalledWith(DANA.id, startDate, endDate));
            await user.click(await within(dialog).findByRole('button', { name: 'ביטול' }));

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
    });

    describe('drag and drop', () => {
        it('refuses the same employee twice in one shift', async () => {
            // A colleague works Dana's shift too
            const AVI = testEmployee(10, { location_id: LOCATION, position_ids: [GUARD.id], primary_position_id: GUARD.id });
            vi.mocked(getEmployeesByLocation).mockResolvedValue([DANA, AVI]);
            vi.mocked(getAssignments).mockImplementation(async (_location, start, end) => (start === end ? [] : [
                savedShift(start), { ...savedShift(start), employee_id: AVI.id },
            ]));
            renderPage();

            // Dana from the sidebar, onto the colleague's chip (above the demand, since the week has none)
            const colleagueChip = await screen.findByTitle('עובד 10 מעל התקן');
            fireEvent.drop(colleagueChip.closest('td')!, {
                dataTransfer: { getData: () => JSON.stringify({ type: 'FROM_SIDEBAR', employee_id: DANA.id }) },
            });

            expect(notify.warning).toHaveBeenCalledWith('העובד כבר משובץ במשמרת זו', 'אותו עובד לא יכול להופיע פעמיים באותה משמרת.');
        });
    });
});
