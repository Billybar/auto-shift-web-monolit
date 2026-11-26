// src/components/layout/navItems.ts
import { CalendarDays, CalendarX, ShieldCheck, SlidersHorizontal, Users, type LucideIcon } from 'lucide-react';
import { UserRole } from '@/types';
import type { User } from '@/types';

/** Who manages a location's employees and settings. App.tsx guards those routes with the same list. */
export const MANAGE_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.MANAGER, UserRole.SCHEDULER];
export const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN];

/** Whether this user manages the location: the same roles that see the management pages. */
export function canManage(user: User | null): boolean {
    return user !== null && MANAGE_ROLES.includes(user.role);
}

export interface NavItem {
    path: string;
    label: string;
    icon: LucideIcon;
    /** The roles that see the item; everyone when omitted */
    roles?: UserRole[];
}

/** The pages of the header menu, in menu order. Each label is also the page's title. */
export const NAV_ITEMS: NavItem[] = [
    { path: '/', label: 'סידור שבועי', icon: CalendarDays },
    { path: '/employees', label: 'ניהול עובדים', icon: Users, roles: MANAGE_ROLES },
    { path: '/constraints', label: 'אילוצים', icon: CalendarX },
    // Roles and the weekly demand template; same audience as employee management
    { path: '/location-settings', label: 'הגדרות אתר', icon: SlidersHorizontal, roles: MANAGE_ROLES },
    // Organizations, locations, shifts and staff logins
    { path: '/admin', label: 'ניהול מערכת', icon: ShieldCheck, roles: ADMIN_ROLES },
];

/** The menu items this user may open. */
export function visibleNavItems(user: User | null): NavItem[] {
    return NAV_ITEMS.filter((item) => !item.roles || (user !== null && item.roles.includes(user.role)));
}

/** The item of the page at this path, if it has one. */
export function navItemAt(pathname: string): NavItem | undefined {
    return NAV_ITEMS.find((item) => item.path === pathname);
}
