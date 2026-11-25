// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addDays, toDateStr, upcomingSunday } from './dates';

// 2026 in Israel: clocks go forward on Friday 27 March and back on Sunday 25 October

describe('test environment', () => {
    it('runs in Israel time, so the date tests mean what they say', () => {
        expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(-120); // winter, UTC+2
        expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(-180); // summer, UTC+3
    });
});

describe('toDateStr', () => {
    it('pads month and day', () => {
        expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('gives the local day, not the UTC day', () => {
        // 01:30 on 1 January in Israel is still 31 December in UTC
        const earlyMorning = new Date(2026, 0, 1, 1, 30);
        expect(earlyMorning.toISOString().slice(0, 10)).toBe('2025-12-31');
        expect(toDateStr(earlyMorning)).toBe('2026-01-01');
    });
});

describe('addDays', () => {
    it.each([
        ['2026-11-22', 6, '2026-11-28'],
        ['2026-11-29', 7, '2026-12-06'],   // month rollover
        ['2026-12-27', 7, '2027-01-03'],   // year rollover
        ['2026-11-22', -1, '2026-11-21'],  // backwards
        ['2028-02-28', 1, '2028-02-29'],   // leap day
        ['2026-11-22', 0, '2026-11-22'],
    ])('%s + %i days = %s', (start, days, expected) => {
        expect(addDays(start, days)).toBe(expected);
    });

    it('is not shifted by the clock changes', () => {
        expect(addDays('2026-03-22', 7)).toBe('2026-03-29'); // spans 27 March
        expect(addDays('2026-10-18', 7)).toBe('2026-10-25'); // ends on 25 October
        expect(addDays('2026-10-25', -7)).toBe('2026-10-18');
    });

    it('steps day by day through the spring week without skipping or repeating a date', () => {
        const week = Array.from({ length: 7 }, (_, i) => addDays('2026-03-22', i));
        expect(week).toEqual([
            '2026-03-22', '2026-03-23', '2026-03-24', '2026-03-25', '2026-03-26', '2026-03-27', '2026-03-28',
        ]);
    });
});

describe('upcomingSunday', () => {
    it.each([
        ['Sunday', new Date(2026, 10, 22, 9), '2026-11-29'],    // a Sunday gives the following one
        ['Wednesday', new Date(2026, 10, 25, 9), '2026-11-29'],
        ['Saturday night', new Date(2026, 10, 28, 23, 59), '2026-11-29'],
    ])('on %s', (_label, today, expected) => {
        expect(upcomingSunday(today)).toBe(expected);
    });

    it('lands on Sunday across the clock changes', () => {
        expect(upcomingSunday(new Date(2026, 2, 25, 12))).toBe('2026-03-29');
        expect(upcomingSunday(new Date(2026, 2, 27, 0, 30))).toBe('2026-03-29'); // the night clocks go forward
        expect(upcomingSunday(new Date(2026, 9, 24, 23, 30))).toBe('2026-10-25'); // the night clocks go back
    });
});
