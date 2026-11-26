import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStaffUser, deleteStaffUser, getStaffUsers, updateStaffUser } from '@/api/admin';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { testLocation, testStaffUser, testUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import { UserRole } from '@/types';
import type { Client, Organization } from '@/types';
import UsersTab from './UsersTab';

vi.mock('@/api/admin', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/admin')>()),
    getStaffUsers: vi.fn(),
    createStaffUser: vi.fn(),
    updateStaffUser: vi.fn(),
    deleteStaffUser: vi.fn(),
}));

// Organization 2 has no clients or locations
const ORGANIZATIONS: Organization[] = [{ id: 1, name: 'ארגון א' }, { id: 2, name: 'ארגון ב' }];
const CLIENTS: Client[] = [{ id: 10, name: 'לקוח א', organization_id: 1 }];
const LOCATIONS = [testLocation(5, { name: 'אתר א', client_id: 10 })];

// The signed-in admin, a manager scoped to a client and a location, and a scheduler linked to an employee
const ME = testStaffUser(1, { role: UserRole.ADMIN, email: 'admin@example.com', organization_id: null, first_name: 'אני' });
const MANAGER = testStaffUser(2, { clients: [CLIENTS[0]], locations: [LOCATIONS[0]] });
const SCHEDULER = testStaffUser(3, { role: UserRole.SCHEDULER, employee_id: 9 });

const renderTab = () => renderWithProviders(
    <UsersTab organizations={ORGANIZATIONS} clients={CLIENTS} locations={LOCATIONS} />,
    { user: testUser(UserRole.ADMIN, { email: 'Admin@example.com' }) },
);

const userRow = async (name: string) => (await screen.findByText(name)).closest('tr')!;

describe('UsersTab', () => {
    beforeEach(() => {
        vi.mocked(getStaffUsers).mockResolvedValue([ME, MANAGER, SCHEDULER]);
        vi.mocked(createStaffUser).mockResolvedValue(testStaffUser(4));
        vi.mocked(updateStaffUser).mockResolvedValue(MANAGER);
        vi.mocked(deleteStaffUser).mockResolvedValue();
    });

    it('lists the staff with their role and scope', async () => {
        renderTab();

        const manager = within(await userRow('משתמש 2'));
        expect(manager.getByText('מנהל')).toBeInTheDocument();
        expect(manager.getByText('ארגון א')).toBeInTheDocument();
        expect(manager.getByText('לקוח א')).toBeInTheDocument();
        expect(manager.getByText('אתר א')).toBeInTheDocument();

        const admin = within(await userRow('אני 1'));
        expect(admin.getByText('מנהל מערכת')).toBeInTheDocument();
        expect(admin.getByText('כל הלקוחות')).toBeInTheDocument();
        expect(admin.getByText('כל האתרים')).toBeInTheDocument();

        // No clients or locations
        expect(within(await userRow('משתמש 3')).getAllByText('—')).toHaveLength(2);
    });

    it('says when there are no staff users', async () => {
        vi.mocked(getStaffUsers).mockResolvedValue([]);
        renderTab();

        expect(await screen.findByText('עדיין אין משתמשי צוות.')).toBeInTheDocument();
    });

    it('shows a failed load in place of the list, with a retry', async () => {
        vi.mocked(getStaffUsers).mockRejectedValue(apiError(500));
        const { user } = renderTab();

        expect(await screen.findByText('טעינת המשתמשים נכשלה')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'משתמש חדש' })).not.toBeInTheDocument();

        vi.mocked(getStaffUsers).mockResolvedValue([MANAGER]);
        await user.click(screen.getByRole('button', { name: 'נסה שוב' }));

        expect(await screen.findByText('משתמש 2')).toBeInTheDocument();
    });

    it("can't delete your own account or a login linked to an employee", async () => {
        renderTab();

        expect(within(await userRow('אני 1')).getByRole('button', { name: 'לא ניתן למחוק את החשבון שלך' })).toBeDisabled();
        expect(within(await userRow('משתמש 3')).getByRole('button', { name: /^מקושר לעובד/ })).toBeDisabled();
        expect(within(await userRow('משתמש 2')).getByRole('button', { name: 'מחק משתמש' })).toBeEnabled();
    });

    it('deletes nothing when the delete is cancelled', async () => {
        const { user } = renderTab();

        await user.click(within(await userRow('משתמש 2')).getByRole('button', { name: 'מחק משתמש' }));
        const dialog = screen.getByRole('alertdialog', { name: 'למחוק את המשתמש?' });
        expect(dialog).toHaveTextContent('המחיקה של משתמש 2 סופית');
        await user.click(within(dialog).getByRole('button', { name: 'ביטול' }));

        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(deleteStaffUser).not.toHaveBeenCalled();
    });

    it('deletes a confirmed user', async () => {
        const { user } = renderTab();

        await user.click(within(await userRow('משתמש 2')).getByRole('button', { name: 'מחק משתמש' }));
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'מחיקה' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('המשתמש נמחק'));
        expect(vi.mocked(deleteStaffUser).mock.calls[0][0]).toBe(2);
    });

    it('creates a manager scoped to a client and a location', async () => {
        const { user } = renderTab();
        await screen.findByText('משתמש 2');

        await user.click(screen.getByRole('button', { name: 'משתמש חדש' }));
        const dialog = screen.getByRole('dialog', { name: 'יצירת משתמש חדש' });
        await user.type(within(dialog).getByLabelText('שם פרטי'), 'רון');
        await user.type(within(dialog).getByLabelText('שם משפחה'), 'לוי');
        await user.type(within(dialog).getByLabelText('מייל'), 'ron@example.com');
        await user.type(within(dialog).getByLabelText('סיסמא ראשונית'), 'secret123');
        await user.selectOptions(within(dialog).getByLabelText('ארגון'), '1');
        await user.click(within(dialog).getByRole('checkbox', { name: 'לקוח א' }));
        await user.click(within(dialog).getByRole('checkbox', { name: 'אתר א' }));
        await user.click(within(dialog).getByRole('button', { name: 'צור משתמש' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('המשתמש נוסף'));
        expect(createStaffUser).toHaveBeenCalledWith({
            first_name: 'רון',
            last_name: 'לוי',
            email: 'ron@example.com',
            password: 'secret123',
            role: UserRole.MANAGER,
            organization_id: 1,
            client_ids: [10],
            location_ids: [5],
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('hides the scope for an admin, and says when an organization has nothing to pick', async () => {
        const { user } = renderTab();
        await screen.findByText('משתמש 2');
        await user.click(screen.getByRole('button', { name: 'משתמש חדש' }));

        await user.selectOptions(screen.getByLabelText('ארגון'), '2');
        expect(screen.getByText('אין לקוחות בארגון זה')).toBeInTheDocument();
        expect(screen.getByText('אין אתרים בארגון זה')).toBeInTheDocument();

        await user.selectOptions(screen.getByLabelText('הרשאה'), UserRole.ADMIN);
        expect(screen.getByText('למנהל מערכת יש גישה לכל הארגונים והאתרים.')).toBeInTheDocument();
        expect(screen.queryByLabelText('ארגון')).not.toBeInTheDocument();
    });

    it('edits a user from their values, without a password', async () => {
        const { user } = renderTab();

        await user.click(within(await userRow('משתמש 2')).getByRole('button', { name: 'עריכה' }));
        const dialog = screen.getByRole('dialog', { name: 'עריכת משתמש' });
        expect(within(dialog).getByLabelText('מייל')).toHaveValue('staff2@example.com');
        expect(within(dialog).getByRole('checkbox', { name: 'לקוח א' })).toBeChecked();
        expect(within(dialog).queryByLabelText('סיסמא ראשונית')).not.toBeInTheDocument();

        await user.clear(within(dialog).getByLabelText('שם פרטי'));
        await user.type(within(dialog).getByLabelText('שם פרטי'), 'מיכל');
        await user.click(within(dialog).getByRole('button', { name: 'שמור שינויים' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('המשתמש עודכן'));
        expect(updateStaffUser).toHaveBeenCalledWith(2, expect.objectContaining({ first_name: 'מיכל', client_ids: [10], location_ids: [5] }));
    });

    it("locks the email and role of the user's own account", async () => {
        const { user } = renderTab();

        await user.click(within(await userRow('אני 1')).getByRole('button', { name: 'עריכה' }));

        expect(screen.getByLabelText('מייל')).toBeDisabled();
        expect(screen.getByLabelText('הרשאה')).toBeDisabled();
        expect(screen.getByText('לא ניתן לשנות את המייל וההרשאה של החשבון שלך.')).toBeInTheDocument();
    });

    it('explains a failed create inside the dialog, which cancel closes', async () => {
        vi.mocked(createStaffUser).mockRejectedValue(apiError(500));
        const { user } = renderTab();
        await screen.findByText('משתמש 2');
        await user.click(screen.getByRole('button', { name: 'משתמש חדש' }));

        await user.type(screen.getByLabelText('שם פרטי'), 'רון');
        await user.type(screen.getByLabelText('שם משפחה'), 'לוי');
        await user.type(screen.getByLabelText('מייל'), 'ron@example.com');
        await user.type(screen.getByLabelText('סיסמא ראשונית'), 'secret123');
        await user.selectOptions(screen.getByLabelText('הרשאה'), UserRole.ADMIN);
        await user.click(screen.getByRole('button', { name: 'צור משתמש' }));

        expect(await screen.findByText('יצירת המשתמש נכשלה')).toBeInTheDocument();
        expect(createStaffUser).toHaveBeenCalledWith(expect.objectContaining({ role: UserRole.ADMIN, organization_id: null, client_ids: [] }));

        await user.click(screen.getByRole('button', { name: 'ביטול' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
