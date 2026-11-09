// src/features/admin/AdminPage.tsx
import { Tabs } from 'radix-ui';

import InlineAlert from '../../components/ui/InlineAlert';
import HierarchyTab from './HierarchyTab';
import ShiftsTab from './ShiftsTab';
import UsersTab from './UsersTab';
import { useAdminData } from './hooks/useAdminData';

const TAB_TRIGGER_CLASS =
    'px-4 py-2 text-sm font-medium text-slate-600 border-b-2 border-transparent -mb-px transition ' +
    'hover:text-slate-900 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700';

/**
 * System administration (ניהול מערכת), for admins only: organizations, clients, locations, their
 * shifts, and staff logins. Works before any location exists, so it ignores the header's location.
 */
export default function AdminPage() {
    const { organizations, clients, locations, isLoading, loadError, reload } = useAdminData();

    if (isLoading && organizations.length === 0 && !loadError) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (loadError) {
        return (
            <InlineAlert variant="error" title="טעינת נתוני הניהול נכשלה" action={{ label: 'נסה שוב', onClick: reload }}>
                {loadError.message}
            </InlineAlert>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <Tabs.Root defaultValue="hierarchy" dir="rtl">
                <Tabs.List className="flex border-b border-slate-200 mb-4" aria-label="ניהול מערכת">
                    <Tabs.Trigger value="hierarchy" className={TAB_TRIGGER_CLASS}>מבנה ארגוני</Tabs.Trigger>
                    <Tabs.Trigger value="shifts" className={TAB_TRIGGER_CLASS}>משמרות</Tabs.Trigger>
                    <Tabs.Trigger value="users" className={TAB_TRIGGER_CLASS}>משתמשים</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="hierarchy" className="focus:outline-none">
                    <HierarchyTab
                        organizations={organizations}
                        clients={clients}
                        locations={locations}
                        onChanged={reload}
                    />
                </Tabs.Content>
                <Tabs.Content value="shifts" className="focus:outline-none">
                    <ShiftsTab locations={locations} />
                </Tabs.Content>
                <Tabs.Content value="users" className="focus:outline-none">
                    <UsersTab organizations={organizations} clients={clients} locations={locations} />
                </Tabs.Content>
            </Tabs.Root>
        </div>
    );
}
