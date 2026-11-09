// src/features/admin/UsersTab.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { deleteStaffUser, getStaffUsers } from '../../api/admin';
import { logError, toAppError } from '../../api/errors';
import type { AppError } from '../../api/errors';
import InlineAlert from '../../components/ui/InlineAlert';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/confirmContext';
import { notify } from '../../lib/notify';
import { UserRole } from '../../types';
import type { Client, LocationData, Organization, StaffUser } from '../../types';
import UserFormModal from './UserFormModal';

const ROLE_LABELS: Record<UserRole, string> = {
    [UserRole.ADMIN]: 'מנהל מערכת',
    [UserRole.MANAGER]: 'מנהל',
    [UserRole.SCHEDULER]: 'סדרן',
    [UserRole.EMPLOYEE]: 'עובד',
};

const joinNames = (items: { name: string }[]): string => items.map((item) => item.name).join(', ') || '—';

interface UsersTabProps {
    organizations: Organization[];
    clients: Client[];
    locations: LocationData[];
}

/**
 * Staff logins (admins, managers, schedulers), with the form that adds and edits them.
 */
export default function UsersTab({ organizations, clients, locations }: UsersTabProps) {
    const { user: currentUser } = useAuth();
    const confirm = useConfirm();

    const [users, setUsers] = useState<StaffUser[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [loadError, setLoadError] = useState<AppError | null>(null);
    const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
    const [editingUser, setEditingUser] = useState<StaffUser | undefined>(undefined);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const loadUsers = useCallback(async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            setUsers(await getStaffUsers());
        } catch (error) {
            logError('Failed to load staff users:', error);
            setLoadError(toAppError(error));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const organizationNames = useMemo(
        () => new Map(organizations.map((organization) => [organization.id, organization.name])),
        [organizations]
    );

    // The token carries the email but not the user's id
    const isOwnAccount = (user: StaffUser): boolean => user.email === currentUser?.email.toLowerCase();

    const handleOpenCreate = () => {
        setEditingUser(undefined);
        setIsFormOpen(true);
    };

    const handleOpenEdit = (user: StaffUser) => {
        setEditingUser(user);
        setIsFormOpen(true);
    };

    const handleDelete = async (user: StaffUser) => {
        const confirmed = await confirm({
            title: 'למחוק את המשתמש?',
            description: `המחיקה של ${user.first_name} ${user.last_name} סופית: החשבון וההרשאות שלו יימחקו. לא ניתן לבטל פעולה זו.`,
            confirmText: 'מחיקה',
            tone: 'danger',
        });
        if (!confirmed) return;

        try {
            setDeletingId(user.id);
            await deleteStaffUser(user.id);
            notify.success('המשתמש נמחק');
            await loadUsers();
        } catch (err) {
            notify.error(err, 'מחיקת המשתמש נכשלה');
        } finally {
            setDeletingId(null);
        }
    };

    const deleteBlockedReason = (user: StaffUser): string | null => {
        if (isOwnAccount(user)) return 'לא ניתן למחוק את החשבון שלך';
        if (user.employee_id !== null) return 'מקושר לעובד: יש למחוק דרך ניהול עובדים';
        return null;
    };

    if (loadError) {
        return (
            <InlineAlert variant="error" title="טעינת המשתמשים נכשלה" action={{ label: 'נסה שוב', onClick: loadUsers }}>
                {loadError.message}
            </InlineAlert>
        );
    }

    return (
        <div className="space-y-4">
            <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
            >
                <Plus size={16} />
                משתמש חדש
            </button>

            {!isLoading && users.length === 0 && (
                <p className="text-sm text-slate-500">עדיין אין משתמשי צוות.</p>
            )}

            {users.length > 0 && (
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm text-right">
                        <thead className="bg-gray-50 text-xs text-gray-600">
                            <tr>
                                <th className="px-3 py-2 font-medium">שם</th>
                                <th className="px-3 py-2 font-medium">מייל</th>
                                <th className="px-3 py-2 font-medium">הרשאה</th>
                                <th className="px-3 py-2 font-medium">ארגון</th>
                                <th className="px-3 py-2 font-medium">לקוחות</th>
                                <th className="px-3 py-2 font-medium">אתרים</th>
                                <th className="px-3 py-2 font-medium">פעולות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {users.map((user) => {
                                const blockedReason = deleteBlockedReason(user);
                                return (
                                <tr key={user.id}>
                                    <td className="px-3 py-2 font-medium text-slate-800">{user.first_name} {user.last_name}</td>
                                    <td className="px-3 py-2 text-slate-600" dir="ltr">{user.email}</td>
                                    <td className="px-3 py-2 text-slate-600">{ROLE_LABELS[user.role]}</td>
                                    <td className="px-3 py-2 text-slate-600">
                                        {user.organization_id !== null ? organizationNames.get(user.organization_id) ?? '—' : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-slate-600">
                                        {user.role === UserRole.ADMIN ? 'כל הלקוחות' : joinNames(user.clients)}
                                    </td>
                                    <td className="px-3 py-2 text-slate-600">
                                        {user.role === UserRole.ADMIN ? 'כל האתרים' : joinNames(user.locations)}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenEdit(user)}
                                                className="text-blue-600 hover:text-blue-800 font-medium px-3 py-1 bg-blue-50 hover:bg-blue-100 rounded transition"
                                            >
                                                עריכה
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(user)}
                                                disabled={deletingId === user.id || blockedReason !== null}
                                                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                title={blockedReason ?? 'מחק משתמש'}
                                                aria-label={blockedReason ?? 'מחק משתמש'}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Mounted only while open and keyed by user, so the form always starts from that user's values */}
            {isFormOpen && (
                <UserFormModal
                    key={editingUser?.id ?? 'new'}
                    user={editingUser}
                    isOwnAccount={editingUser !== undefined && isOwnAccount(editingUser)}
                    organizations={organizations}
                    clients={clients}
                    locations={locations}
                    onClose={() => setIsFormOpen(false)}
                    onSaved={loadUsers}
                />
            )}
        </div>
    );
}
