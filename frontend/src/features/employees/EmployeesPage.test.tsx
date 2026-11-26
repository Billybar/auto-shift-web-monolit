import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultConstraints, getEmployeeConstraints, syncEmployeeConstraints } from '@/api/constraints';
import { getConstraintGroups } from '@/api/constraintGroups';
import {
    createEmployee, deleteEmployee, getEmployeesByLocation, updateEmployee, updateEmployeeSettings,
} from '@/api/employees';
import { getPositions } from '@/api/positions';
import { getShiftDefinitions } from '@/api/shiftDefinitions';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { testConstraintGroup, testEmployee, testPosition, testShift } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import EmployeesPage from './EmployeesPage';

vi.mock('@/api/employees', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/employees')>()),
    getEmployeesByLocation: vi.fn(),
    createEmployee: vi.fn(),
    updateEmployee: vi.fn(),
    updateEmployeeSettings: vi.fn(),
    deleteEmployee: vi.fn(),
}));

vi.mock('@/api/positions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/positions')>()),
    getPositions: vi.fn(),
}));

// The constraints popup's board
vi.mock('@/api/constraints', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraints')>()),
    getEmployeeConstraints: vi.fn(),
    syncEmployeeConstraints: vi.fn(),
    getDefaultConstraints: vi.fn(),
}));

vi.mock('@/api/shiftDefinitions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/shiftDefinitions')>()),
    getShiftDefinitions: vi.fn(),
}));

vi.mock('@/api/constraintGroups', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraintGroups')>()),
    getConstraintGroups: vi.fn(),
}));

// Two active roles and an archived one
const POSITIONS = [testPosition(1), testPosition(2), testPosition(3, { is_active: false })];
// "עובד 1" is active and holds role 1 as primary; "עובד 2" is inactive and holds only the archived role
const ACTIVE = testEmployee(1, { position_ids: [1], primary_position_id: 1 });
const INACTIVE = testEmployee(2, {
    is_active: false,
    position_ids: [3],
    user: { id: 102, email: 'employee2@example.com', first_name: 'אבי', last_name: 'לוי', created_at: '2026-01-01T00:00:00' },
});

const employeeRow = async (name: string) => (await screen.findByText(name)).closest('tr')!;
const rowNames = () => screen.getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[1].textContent);

describe('EmployeesPage', () => {
    beforeEach(() => {
        vi.mocked(getEmployeesByLocation).mockResolvedValue([ACTIVE, INACTIVE]);
        vi.mocked(getPositions).mockResolvedValue(POSITIONS);
        vi.mocked(createEmployee).mockResolvedValue(testEmployee(3));
        vi.mocked(updateEmployee).mockResolvedValue(ACTIVE);
        vi.mocked(updateEmployeeSettings).mockResolvedValue({});
        vi.mocked(deleteEmployee).mockResolvedValue();
        vi.mocked(getEmployeeConstraints).mockResolvedValue({ constraints: [], note: null, uses_defaults: false });
        vi.mocked(syncEmployeeConstraints).mockResolvedValue({ detail: 'ok', saved_constraints_count: 1 });
        vi.mocked(getDefaultConstraints).mockResolvedValue({ employee_id: 1, constraints: [] });
        vi.mocked(getShiftDefinitions).mockResolvedValue([testShift(1)]);
        vi.mocked(getConstraintGroups).mockResolvedValue([testConstraintGroup(1)]);
    });

    it('asks for a location first, and fetches nothing', () => {
        renderWithProviders(<EmployeesPage />, { locationId: '' });

        expect(screen.getByText('בחר אתר בתפריט העליון כדי לראות את העובדים')).toBeInTheDocument();
        expect(getEmployeesByLocation).not.toHaveBeenCalled();
    });

    it('shows a failed load in place of the table, with a retry', async () => {
        vi.mocked(getEmployeesByLocation).mockRejectedValue(apiError(500));
        const { user } = renderWithProviders(<EmployeesPage />);

        expect(await screen.findByText('טעינת רשימת העובדים נכשלה')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'הוספת עובד' })).not.toBeInTheDocument();

        vi.mocked(getEmployeesByLocation).mockResolvedValue([ACTIVE]);
        await user.click(screen.getByRole('button', { name: 'נסה שוב' }));

        expect(await screen.findByText('עובד 1')).toBeInTheDocument();
    });

    it("lists the employees with their roles and status", async () => {
        renderWithProviders(<EmployeesPage />);

        const active = within(await employeeRow('עובד 1'));
        expect(active.getByTitle('role 1 (תפקיד ראשי)')).toBeInTheDocument();
        expect(active.getByText('פעיל')).toBeInTheDocument();
        expect(active.queryByText('ללא תפקיד')).not.toBeInTheDocument();

        // The archived role still shows, and the employee has no role to be assigned by
        const inactive = within(await employeeRow('אבי לוי'));
        expect(inactive.getByTitle('role 3 (בארכיון)')).toBeInTheDocument();
        expect(inactive.getByText('ללא תפקיד')).toBeInTheDocument();
        expect(inactive.getByText('לא פעיל')).toBeInTheDocument();
        expect(getEmployeesByLocation).toHaveBeenCalledWith(1);
        expect(getPositions).toHaveBeenCalledWith(1, true);
    });

    it('sorts by a column header, flipping on a second click', async () => {
        const third = testEmployee(3, { user: { id: 103, email: 'c@example.com', first_name: 'אבג', last_name: 'א', created_at: '2026-01-01T00:00:00' } });
        vi.mocked(getEmployeesByLocation).mockResolvedValue([ACTIVE, INACTIVE, third]);
        const { user } = renderWithProviders(<EmployeesPage />);
        await screen.findByText('עובד 1');
        // By id, active employees first
        expect(rowNames()).toEqual(['עובד 1', 'אבג א', 'אבי לוי']);

        await user.click(screen.getByRole('button', { name: 'שם' }));
        expect(rowNames()).toEqual(['אבג א', 'עובד 1', 'אבי לוי']);

        await user.click(screen.getByRole('button', { name: 'שם' }));
        expect(rowNames()).toEqual(['עובד 1', 'אבג א', 'אבי לוי']);
    });

    it('adds an employee with a primary role', async () => {
        const { user } = renderWithProviders(<EmployeesPage />);
        await screen.findByText('עובד 1');

        await user.click(screen.getByRole('button', { name: 'הוספת עובד' }));
        const dialog = screen.getByRole('dialog', { name: 'יצירת עובד חדש' });
        // Only the active roles are offered
        expect(within(dialog).queryByRole('button', { name: 'role 3' })).not.toBeInTheDocument();
        expect(within(dialog).getByText('ללא תפקיד העובד לא ישובץ אוטומטית')).toBeInTheDocument();

        await user.type(within(dialog).getByLabelText('שם פרטי'), 'רון');
        await user.type(within(dialog).getByLabelText('שם משפחה'), 'לוי');
        await user.type(within(dialog).getByLabelText('מייל'), 'ron@example.com');
        await user.type(within(dialog).getByLabelText('סיסמא'), '1-8');
        await user.click(within(dialog).getByRole('button', { name: 'role 1' }));

        expect(within(dialog).getByRole('button', { name: 'role 1' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(dialog).getByRole('button', { name: 'role 1 הוא התפקיד הראשי' })).toBeDisabled();
        expect(within(dialog).getByText('הכוכב מסמן את התפקיד הראשי, שהשיבוץ האוטומטי מעדיף')).toBeInTheDocument();

        await user.click(within(dialog).getByRole('button', { name: 'שמור' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('העובד נוסף'));
        expect(createEmployee).toHaveBeenCalledWith(expect.objectContaining({
            first_name: 'רון',
            email: 'ron@example.com',
            location_id: 1,
            password: '1-8',
            position_ids: [1],
            primary_position_id: 1,
        }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it("saves a new employee's optional details", async () => {
        const { user } = renderWithProviders(<EmployeesPage />);
        await screen.findByText('עובד 1');
        await user.click(screen.getByRole('button', { name: 'הוספת עובד' }));

        await user.type(screen.getByLabelText('שם פרטי'), 'רון');
        await user.type(screen.getByLabelText('שם משפחה'), 'לוי');
        await user.type(screen.getByLabelText('מייל'), 'ron@example.com');
        await user.type(screen.getByLabelText('סיסמא'), '1-8');
        fireEvent.change(screen.getByLabelText('צבע'), { target: { value: '#ff0000' } });
        await user.click(screen.getByRole('checkbox', { name: 'פעיל' }));
        await user.type(screen.getByLabelText('הערות (אופציונלי)'), 'מעדיף לילות');
        await user.type(screen.getByLabelText('ילמ ID'), ' 111 ');
        await user.type(screen.getByLabelText('משמרות ID'), '222');
        // Blank is no id
        await user.type(screen.getByLabelText('ShiftOrg ID'), '   ');
        await user.click(screen.getByRole('button', { name: 'שמור' }));

        await waitFor(() => expect(createEmployee).toHaveBeenCalledWith(expect.objectContaining({
            color: 'ff0000',
            is_active: false,
            notes: 'מעדיף לילות',
            yalam_id: '111',
            mishmarot_id: '222',
            shiftorg_id: null,
            position_ids: [],
            primary_position_id: null,
        })));
    });

    it('passes the primary role on when it is unticked', async () => {
        const { user } = renderWithProviders(<EmployeesPage />);
        await screen.findByText('עובד 1');
        await user.click(screen.getByRole('button', { name: 'הוספת עובד' }));

        await user.click(screen.getByRole('button', { name: 'role 1' }));
        await user.click(screen.getByRole('button', { name: 'role 2' }));
        await user.click(screen.getByRole('button', { name: 'הגדר את role 2 כתפקיד ראשי' }));
        expect(screen.getByRole('button', { name: 'role 2 הוא התפקיד הראשי' })).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'role 2' }));

        expect(screen.getByRole('button', { name: 'role 2' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: 'role 1 הוא התפקיד הראשי' })).toBeInTheDocument();
    });

    it('says when the location has no roles to pick', async () => {
        vi.mocked(getPositions).mockResolvedValue([]);
        const { user } = renderWithProviders(<EmployeesPage />);
        await screen.findByText('עובד 1');

        await user.click(screen.getByRole('button', { name: 'הוספת עובד' }));

        expect(screen.getByText('לא הוגדרו תפקידים באתר. אפשר להוסיף אותם בהגדרות אתר.')).toBeInTheDocument();
        expect(screen.queryByText('ללא תפקיד העובד לא ישובץ אוטומטית')).not.toBeInTheDocument();
    });

    it('closes the employee dialog with Esc', async () => {
        const { user } = renderWithProviders(<EmployeesPage />);
        await screen.findByText('עובד 1');
        await user.click(screen.getByRole('button', { name: 'הוספת עובד' }));

        await user.keyboard('{Escape}');

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('marks a taken email on its field and keeps the dialog open', async () => {
        vi.mocked(createEmployee).mockRejectedValue(apiError(409));
        const { user } = renderWithProviders(<EmployeesPage />);
        await screen.findByText('עובד 1');
        await user.click(screen.getByRole('button', { name: 'הוספת עובד' }));

        await user.type(screen.getByLabelText('שם פרטי'), 'רון');
        await user.type(screen.getByLabelText('שם משפחה'), 'לוי');
        await user.type(screen.getByLabelText('מייל'), 'employee1@example.com');
        await user.type(screen.getByLabelText('סיסמא'), '1-8');
        await user.click(screen.getByRole('button', { name: 'שמור' }));

        expect(await screen.findByText('כתובת המייל כבר קיימת במערכת')).toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'יצירת עובד חדש' })).toBeInTheDocument();
        expect(notify.success).not.toHaveBeenCalled();
    });

    it('edits an employee and their shift limits', async () => {
        const { user } = renderWithProviders(<EmployeesPage />);

        await user.click(within(await employeeRow('עובד 1')).getByRole('button', { name: 'עריכה' }));
        const dialog = screen.getByRole('dialog', { name: 'עריכת עובד והגדרות' });
        expect(within(dialog).getByLabelText('סיסמא (לא ניתן לערוך)')).toBeDisabled();
        expect(within(dialog).getByText('הגדרת משמרות עובד')).toBeInTheDocument();
        expect(within(dialog).getByLabelText('שם פרטי')).toHaveValue('עובד');

        await user.clear(within(dialog).getByLabelText('שם פרטי'));
        await user.type(within(dialog).getByLabelText('שם פרטי'), 'דנה');
        await user.click(within(dialog).getByRole('button', { name: 'שמור' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('פרטי העובד עודכנו'));
        expect(updateEmployee).toHaveBeenCalledWith(1, expect.objectContaining({ first_name: 'דנה', position_ids: [1] }));
        expect(updateEmployeeSettings).toHaveBeenCalledWith(1, expect.objectContaining({ max_shifts_per_week: expect.any(Number) }));
    });

    it('deletes nothing when the delete is cancelled', async () => {
        const { user } = renderWithProviders(<EmployeesPage />);

        await user.click(within(await employeeRow('אבי לוי')).getByRole('button', { name: 'מחק עובד' }));
        const dialog = screen.getByRole('alertdialog', { name: 'למחוק את העובד?' });
        expect(dialog).toHaveTextContent('המחיקה של אבי לוי סופית');
        await user.click(within(dialog).getByRole('button', { name: 'ביטול' }));

        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(deleteEmployee).not.toHaveBeenCalled();
    });

    it('deletes a confirmed employee', async () => {
        const { user } = renderWithProviders(<EmployeesPage />);

        await user.click(within(await employeeRow('אבי לוי')).getByRole('button', { name: 'מחק עובד' }));
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'מחיקה' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('העובד נמחק'));
        expect(vi.mocked(deleteEmployee).mock.calls[0][0]).toBe(2);
    });

    it("opens the employee's constraints board, which cancel closes", async () => {
        const { user } = renderWithProviders(<EmployeesPage />);

        await user.click(within(await employeeRow('עובד 1')).getByRole('button', { name: 'אילוצים' }));
        const dialog = screen.getByRole('dialog', { name: 'האילוצים של עובד 1' });
        // A scheduler can also mark "must work"
        expect(within(dialog).getByText('לחץ על תא: פנוי ➔ לא יכול ➔ מעדיף ➔ חייב')).toBeInTheDocument();
        await waitFor(() => expect(getEmployeeConstraints).toHaveBeenCalledWith(1, expect.any(String), expect.any(String)));

        await user.click(within(dialog).getByRole('button', { name: 'ביטול' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('keeps the constraints board open on Esc, and closes it after a save', async () => {
        const { user } = renderWithProviders(<EmployeesPage />);
        await user.click(within(await employeeRow('עובד 1')).getByRole('button', { name: 'אילוצים' }));
        const dialog = screen.getByRole('dialog', { name: 'האילוצים של עובד 1' });
        const save = within(dialog).getByRole('button', { name: 'שמור אילוצים' });
        await waitFor(() => expect(save).toBeEnabled());

        await user.keyboard('{Escape}');
        expect(dialog).toBeInTheDocument();

        await user.click(save);

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('האילוצים נשמרו'));
        expect(syncEmployeeConstraints).toHaveBeenCalledWith(1, expect.any(String), expect.any(String), { constraints: [], note: null });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
});
