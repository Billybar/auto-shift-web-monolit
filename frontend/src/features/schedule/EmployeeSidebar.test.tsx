import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getEmployeeConstraints } from '@/api/constraints';
import { testEmployee, testPosition, testShift } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { Assignment, Employee } from '@/types';
import EmployeeSidebar from './EmployeeSidebar';

// queries.ts reads this module's fetchers, so whatever the sidebar doesn't call stays real
vi.mock('@/api/constraints', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraints')>()),
    getEmployeeConstraints: vi.fn(),
}));

const GUARD = testPosition(1, { name: 'מאבטח' });
const SUPERVISOR = testPosition(2, { name: 'אחמ"ש' });
const DRIVER = testPosition(3, { name: 'נהג', is_active: false });

// Holds a role; holds only an archived role; has left
const GUARD_EMP = testEmployee(1, { position_ids: [GUARD.id], primary_position_id: GUARD.id });
const NO_ROLE_EMP = testEmployee(2, { position_ids: [DRIVER.id] });
const FORMER_EMP = testEmployee(3, { is_active: false, position_ids: [GUARD.id] });

const MORNING = testShift(1, { name: 'בוקר' });
const EVENING = testShift(2, { name: 'ערב', start_time: '15:00', end_time: '23:00' });
const WEEK = ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05'];

// GUARD_EMP works Sunday morning and Monday evening
const ASSIGNMENTS: Assignment[] = [
    { employee_id: GUARD_EMP.id, shift_id: MORNING.id, date: WEEK[0], position_id: GUARD.id },
    { employee_id: GUARD_EMP.id, shift_id: EVENING.id, date: WEEK[1], position_id: GUARD.id },
];

const byId = (...employees: Employee[]) => Object.fromEntries(employees.map(e => [e.id, e]));

type Props = Parameters<typeof EmployeeSidebar>[0];

const renderSidebar = (props: Partial<Props> = {}) => {
    const handlers = { onSearchChange: vi.fn(), onEditEmployee: vi.fn(), onEditConstraints: vi.fn() };
    const result = renderWithProviders(
        <EmployeeSidebar
            employeesMap={byId(GUARD_EMP, NO_ROLE_EMP, FORMER_EMP)}
            employeeLabels={new Map()}
            positions={[GUARD, SUPERVISOR, DRIVER]}
            assignments={ASSIGNMENTS}
            searchQuery=""
            shifts={[MORNING, EVENING]}
            weekDates={WEEK}
            pendingConstraintIds={new Set()}
            {...handlers}
            {...props}
        />
    );
    return { ...result, ...handlers };
};

/** The number next to the heading: how many employees the list shows. */
const shownCount = () => screen.getByRole('heading', { name: 'עובדים' }).nextElementSibling;

const listedNames = () => ['עובד 1', 'עובד 2', 'עובד 3'].filter(name => screen.queryByText(name));

const NO_ROLE_WARNING = 'לעובד אין תפקיד פעיל, ולכן השיבוץ האוטומטי לא ישבץ אותו';

describe('EmployeeSidebar', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.mocked(getEmployeeConstraints).mockResolvedValue({ constraints: [], note: null, uses_defaults: false });
    });

    describe('the list', () => {
        it('shows the active employees only, and counts them', () => {
            renderSidebar();

            expect(listedNames()).toEqual(['עובד 1', 'עובד 2']);
            expect(shownCount()).toHaveTextContent('2');
        });

        it('filters by the search, by full name', () => {
            renderSidebar({ searchQuery: 'עובד 2' });

            expect(listedNames()).toEqual(['עובד 2']);
            expect(shownCount()).toHaveTextContent('1');
        });

        it('passes the typed search up', async () => {
            const { user, onSearchChange } = renderSidebar();

            await user.type(screen.getByRole('searchbox', { name: 'חיפוש עובד' }), 'ד');

            expect(onSearchChange).toHaveBeenCalledWith('ד');
        });

        it('shows the compact label on the chip', () => {
            renderSidebar({ employeeLabels: new Map([[GUARD_EMP.id, 'עובד']]) });

            expect(screen.getByText('עובד')).toBeInTheDocument();
            expect(screen.queryByText('עובד 1')).not.toBeInTheDocument();
        });
    });

    describe('the role filter', () => {
        const roleFilter = () => screen.getByRole('combobox', { name: 'סינון לפי תפקיד' });

        it('offers every active role, and the employees with none', () => {
            renderSidebar();

            const options = within(roleFilter()).getAllByRole('option').map(o => o.textContent);
            expect(options).toEqual(['כל התפקידים', 'מאבטח', 'אחמ"ש', 'ללא תפקיד']);
        });

        it("leaves one role's holders", async () => {
            const { user } = renderSidebar();

            await user.selectOptions(roleFilter(), 'מאבטח');

            expect(listedNames()).toEqual(['עובד 1']);
        });

        it('leaves the employees with no active role, and warns about them', async () => {
            const { user } = renderSidebar();

            await user.selectOptions(roleFilter(), 'ללא תפקיד');

            expect(listedNames()).toEqual(['עובד 2']);
            expect(screen.getByTitle(NO_ROLE_WARNING)).toBeInTheDocument();

            await user.selectOptions(roleFilter(), 'כל התפקידים');
            expect(listedNames()).toEqual(['עובד 1', 'עובד 2']);
        });

        it("shows each employee's role badges", () => {
            renderSidebar();

            expect(screen.getByTitle('מאבטח (תפקיד ראשי)')).toBeInTheDocument();
        });

        it('has no filter, no badges and no badge toggle with one active role', () => {
            renderSidebar({ positions: [GUARD, DRIVER] });

            expect(screen.queryByRole('combobox', { name: 'סינון לפי תפקיד' })).not.toBeInTheDocument();
            expect(screen.queryByTitle('מאבטח (תפקיד ראשי)')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'הסתרת תפקידים' })).not.toBeInTheDocument();
        });
    });

    describe('the badge toggle', () => {
        const BADGE = 'מאבטח (תפקיד ראשי)';

        it('hides the badges and shows them again', async () => {
            const { user } = renderSidebar();

            const hide = screen.getByRole('button', { name: 'הסתרת תפקידים' });
            expect(hide).toHaveAttribute('aria-pressed', 'true');

            await user.click(hide);
            expect(screen.queryByTitle(BADGE)).not.toBeInTheDocument();
            // The filter stays: it filters, it doesn't show badges
            expect(screen.getByRole('combobox', { name: 'סינון לפי תפקיד' })).toBeInTheDocument();

            const show = screen.getByRole('button', { name: 'הצגת תפקידים' });
            expect(show).toHaveAttribute('aria-pressed', 'false');
            await user.click(show);
            expect(screen.getByTitle(BADGE)).toBeInTheDocument();
        });

        it('remembers the choice', async () => {
            const { user, unmount } = renderSidebar();
            await user.click(screen.getByRole('button', { name: 'הסתרת תפקידים' }));
            unmount();

            renderSidebar();

            expect(screen.queryByTitle(BADGE)).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'הצגת תפקידים' })).toBeInTheDocument();
        });
    });

    describe('a row', () => {
        const countBox = () => screen.getByRole('button', { name: 'לחיצה לעריכת אילוצים: עובד 1' });

        it("counts the employee's shifts this week", () => {
            renderSidebar({ employeesMap: byId(GUARD_EMP) });

            expect(countBox()).toHaveTextContent('2');
        });

        it("marks an employee who hasn't submitted constraints", () => {
            renderSidebar({ employeesMap: byId(GUARD_EMP), pendingConstraintIds: new Set([GUARD_EMP.id]) });

            expect(within(countBox()).getByRole('img', { name: 'לא הוגשו אילוצים לשבוע זה' })).toBeInTheDocument();
        });

        it("doesn't mark one who has", () => {
            renderSidebar({ employeesMap: byId(GUARD_EMP) });

            expect(screen.queryByRole('img', { name: 'לא הוגשו אילוצים לשבוע זה' })).not.toBeInTheDocument();
        });

        it('opens the constraints from the count, and the settings from the edit button', async () => {
            const { user, onEditConstraints, onEditEmployee } = renderSidebar({ employeesMap: byId(GUARD_EMP) });

            await user.click(countBox());
            expect(onEditConstraints).toHaveBeenCalledWith(GUARD_EMP.id);

            await user.click(screen.getByRole('button', { name: 'ערוך משמרות והעדפות עובד' }));
            expect(onEditEmployee).toHaveBeenCalledWith(GUARD_EMP.id);
        });

        it('carries the employee when dragged', () => {
            const setData = vi.fn();
            renderSidebar({ employeesMap: byId(GUARD_EMP) });

            fireEvent.dragStart(screen.getByText('עובד 1').closest('[draggable]')!, { dataTransfer: { setData } });

            expect(setData).toHaveBeenCalledWith('application/json', JSON.stringify({ type: 'FROM_SIDEBAR', employee_id: GUARD_EMP.id }));
        });
    });

    describe('the hover card', () => {
        /** Hovers the count box and waits for the card (Radix opens it after 150 ms). */
        const hoverCard = async (user: ReturnType<typeof renderSidebar>['user']) => {
            await user.hover(screen.getByRole('button', { name: 'לחיצה לעריכת אילוצים: עובד 1' }));
            return (await screen.findByText('משמרת')).closest('table')!;
        };

        /** The day cells of a shift's row in the card, Sunday first. */
        const dayCells = (table: HTMLElement, shiftName: string) =>
            within(within(table).getByRole('cell', { name: shiftName }).closest('tr')!).getAllByRole('cell').slice(1);

        it("loads the employee's week and names them", async () => {
            const { user } = renderSidebar({ employeesMap: byId(GUARD_EMP) });

            await hoverCard(user);

            expect(getEmployeeConstraints).toHaveBeenCalledWith(GUARD_EMP.id, WEEK[0], WEEK[6]);
            // The chip and the card
            expect(screen.getAllByText('עובד 1')).toHaveLength(2);
        });

        it('colours each cell by its mark, and checks the assigned ones', async () => {
            vi.mocked(getEmployeeConstraints).mockResolvedValue({
                constraints: [
                    { id: 1, employee_id: 1, group_id: 1, shift_id: MORNING.id, date: WEEK[0], constraint_type: 'cannot_work' },
                    { id: 2, employee_id: 1, group_id: 1, shift_id: MORNING.id, date: `${WEEK[1]}T00:00:00`, constraint_type: 'must_work' },
                    { id: 3, employee_id: 1, group_id: 2, shift_id: EVENING.id, date: WEEK[2], constraint_type: 'prefer_to' },
                ],
                note: null,
                uses_defaults: false,
            });
            const { user } = renderSidebar({ employeesMap: byId(GUARD_EMP) });

            const table = await hoverCard(user);
            await vi.waitFor(() => expect(dayCells(table, 'בוקר')[0]).toHaveClass('bg-red-200'));

            const morning = dayCells(table, 'בוקר');
            const evening = dayCells(table, 'ערב');
            expect(morning[1]).toHaveClass('bg-green-200');
            expect(evening[2]).toHaveClass('bg-blue-200');
            expect(evening[3]).toHaveClass('bg-white');
            // Assigned: Sunday morning and Monday evening
            expect(morning[0].querySelector('svg')).not.toBeNull();
            expect(evening[1].querySelector('svg')).not.toBeNull();
            expect(morning[1].querySelector('svg')).toBeNull();
        });

        it("says the week shows the defaults, and shows the employee's note", async () => {
            vi.mocked(getEmployeeConstraints).mockResolvedValue({ constraints: [], note: 'רק בקרים', uses_defaults: true });
            const { user } = renderSidebar({ employeesMap: byId(GUARD_EMP), pendingConstraintIds: new Set([GUARD_EMP.id]) });

            await hoverCard(user);

            expect(screen.getByText('לא הוגשו אילוצים לשבוע זה – מוצגת ברירת המחדל')).toBeInTheDocument();
            expect(await screen.findByText('רק בקרים')).toBeInTheDocument();
            expect(screen.getByText('הערה:')).toBeInTheDocument();
        });
    });
});
