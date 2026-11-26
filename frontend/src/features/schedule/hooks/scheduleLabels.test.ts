// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { testEmployee, testPosition, testShift } from '@/test/fixtures';
import type { Employee } from '@/types';
import { formatDayLabel, makeNameLookups, makeShortNames, uniqueLastNamePrefix } from './scheduleLabels';

const named = (id: number, first_name: string, last_name: string): Employee => {
    const employee = testEmployee(id);
    return { ...employee, user: { ...employee.user!, first_name, last_name } };
};

describe('formatDayLabel', () => {
    it('shows the day and month', () => {
        expect(formatDayLabel('2026-10-25')).toContain('25.10');
    });
});

describe('makeNameLookups', () => {
    const names = makeNameLookups(
        [testShift(1, { name: 'ערב' })],
        [testPosition(2)],
        { 3: named(3, 'דנה', 'כהן'), 4: { ...testEmployee(4), user: null } },
    );

    it('finds names by id', () => {
        expect(names.shiftName(1)).toBe('ערב');
        expect(names.positionName(2)).toBe('role 2');
        expect(names.employeeName(3)).toBe('דנה כהן');
    });

    it("falls back to the id for anything that isn't loaded", () => {
        expect(names.shiftName(9)).toBe('משמרת #9');
        expect(names.positionName(9)).toBe('תפקיד #9');
        expect(names.employeeName(9)).toBe('עובד #9');
        // An employee without a user
        expect(names.employeeName(4)).toBe('עובד #4');
    });
});

describe('uniqueLastNamePrefix', () => {
    it('gives the shortest prefix no other last name starts with', () => {
        expect(uniqueLastNamePrefix('לוי', ['כהן'])).toBe('ל.');
        expect(uniqueLastNamePrefix('כהן', ['כץ'])).toBe('כה.');
    });

    it('gives the whole name when no prefix is unique', () => {
        expect(uniqueLastNamePrefix('כהן', ['כהנא'])).toBe('כהן');
    });
});

describe('makeShortNames', () => {
    it('uses the first name alone when no one else has it', () => {
        const labels = makeShortNames([named(1, 'דנה', 'כהן'), named(2, 'יוסי', 'כץ')]);

        expect(labels.get(1)).toBe('דנה');
        expect(labels.get(2)).toBe('יוסי');
    });

    it('adds last-name letters when another employee has the same first name', () => {
        const labels = makeShortNames([named(1, 'דנה', 'כהן'), named(2, 'דנה', 'כץ'), named(3, 'דנה', 'לוי')]);

        expect(labels.get(1)).toBe('דנה כה.');
        // No shorter prefix sets כץ apart from כהן
        expect(labels.get(2)).toBe('דנה כץ');
        expect(labels.get(3)).toBe('דנה ל.');
    });

    it('falls back to the last name, then the id, without a first name', () => {
        const labels = makeShortNames([named(1, ' ', 'מזרחי'), named(2, '', ''), { ...testEmployee(3), user: null }]);

        expect(labels.get(1)).toBe('מזרחי');
        expect(labels.get(2)).toBe('עובד #2');
        expect(labels.get(3)).toBe('עובד #3');
    });

    it('keeps the first name alone when the employee has no last name', () => {
        const labels = makeShortNames([named(1, 'דנה', ''), named(2, 'דנה', 'כהן')]);

        expect(labels.get(1)).toBe('דנה');
        expect(labels.get(2)).toBe('דנה כ.');
    });
});
