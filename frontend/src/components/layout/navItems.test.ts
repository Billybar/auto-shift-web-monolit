import { describe, expect, it } from 'vitest';

import { testUser } from '@/test/fixtures';
import { UserRole } from '@/types';
import { canManage, navItemAt, visibleNavItems } from './navItems';

const labelsFor = (role: UserRole) => visibleNavItems(testUser(role)).map((item) => item.label);

describe('visibleNavItems', () => {
    it('shows an employee only the schedule and the constraints', () => {
        expect(labelsFor(UserRole.EMPLOYEE)).toEqual(['סידור שבועי', 'אילוצים']);
    });

    it.each([UserRole.SCHEDULER, UserRole.MANAGER])('adds the location management pages for a %s', (role) => {
        expect(labelsFor(role)).toEqual(['סידור שבועי', 'ניהול עובדים', 'אילוצים', 'הגדרות אתר']);
    });

    it('shows an admin every page', () => {
        expect(labelsFor(UserRole.ADMIN)).toEqual(['סידור שבועי', 'ניהול עובדים', 'אילוצים', 'הגדרות אתר', 'ניהול מערכת']);
    });

    it('shows only the open pages while nobody is signed in', () => {
        expect(visibleNavItems(null).map((item) => item.path)).toEqual(['/', '/constraints']);
    });
});

describe('canManage', () => {
    it.each([UserRole.ADMIN, UserRole.MANAGER, UserRole.SCHEDULER])('lets a %s manage the location', (role) => {
        expect(canManage(testUser(role))).toBe(true);
    });

    it('refuses an employee and a signed-out visitor', () => {
        expect(canManage(testUser(UserRole.EMPLOYEE))).toBe(false);
        expect(canManage(null)).toBe(false);
    });
});

describe('navItemAt', () => {
    it("finds the page's item by its exact path", () => {
        expect(navItemAt('/employees')?.label).toBe('ניהול עובדים');
        expect(navItemAt('/employees/7')).toBeUndefined();
    });
});
