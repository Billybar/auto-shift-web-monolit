// src/lib/roleLabels.ts
import { UserRole } from '@/types';

/** Each role's name as the UI shows it. */
export const ROLE_LABELS: Record<UserRole, string> = {
    [UserRole.ADMIN]: 'מנהל מערכת',
    [UserRole.MANAGER]: 'מנהל',
    [UserRole.SCHEDULER]: 'סדרן',
    [UserRole.EMPLOYEE]: 'עובד',
};
