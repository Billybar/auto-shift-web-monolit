import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    checkSchedule, getAssignments, getSchedulePublication, saveAssignments, setSchedulePublication,
} from '@/api/assignments';
import { getConstraintSubmissionStatus } from '@/api/constraints';
import { getEmployeesByLocation } from '@/api/employees';
import { getLocationWeights } from '@/api/locations';
import { getPositions } from '@/api/positions';
import { getShiftDefinitions, getWeeklyDemand } from '@/api/shiftDefinitions';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { testEmployee, testLocation, testPosition, testShift, testUser } from '@/test/fixtures';
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
}));
vi.mock('@/api/constraints', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraints')>()),
    getConstraintSubmissionStatus: vi.fn(),
}));

const LOCATION = 3;
const GUARD = testPosition(5, { name: 'מאבטח', location_id: LOCATION });
const MORNING = testShift(1, { location_id: LOCATION });
const DANA = testEmployee(9, { location_id: LOCATION, position_ids: [GUARD.id], primary_position_id: GUARD.id });

/** The week's one saved assignment. */
const savedShift = (date: string): Assignment => ({ employee_id: DANA.id, shift_id: MORNING.id, position_id: GUARD.id, date });

const MAX_SHIFTS: ScheduleViolation = { code: 'max_shifts', employee_id: DANA.id, cells: [], count: 7, limit: 6 };

const setPublished = (isPublished: boolean) => vi.mocked(getSchedulePublication).mockImplementation(async (locationId, week) => ({
    location_id: locationId, week_start_date: week, is_published: isPublished,
}));

const renderPage = (role: UserRole = UserRole.SCHEDULER) =>
    renderWithProviders(<SchedulePage />, { user: testUser(role), locations: [testLocation(LOCATION)] });

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
        vi.mocked(getLocationWeights).mockResolvedValue({ target_shifts: 1 } as LocationWeights);
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
});
