import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkSchedule } from '@/api/assignments';
import { apiError } from '@/test/apiErrors';
import { testEmployee, testPosition, testShift } from '@/test/fixtures';
import type { Assignment, ScheduleCell, ScheduleCheckResult, ScheduleViolation } from '@/types';
import { formatDayLabel, makeNameLookups } from './scheduleLabels';
import { describeViolation, placementKey, useScheduleCheck } from './useScheduleCheck';

vi.mock('@/api/assignments', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/assignments')>()),
    checkSchedule: vi.fn(),
}));

const SUNDAY = '2026-10-25';
const MONDAY = '2026-10-26';
// Built the way the hook builds them, so the test doesn't depend on the ICU's output
const sunday = formatDayLabel(SUNDAY);
const monday = formatDayLabel(MONDAY);

// Employee 7 is "עובד 7"; shift 1 "בוקר", shift 2 "ערב"; role 3 "role 3"
const names = makeNameLookups(
    [testShift(1), testShift(2, { name: 'ערב' })],
    [testPosition(3)],
    { 7: testEmployee(7) },
);

// One violation of employee 7: its code and fields, and its cells when it has any
type ViolationFields = ScheduleViolation extends infer V
    ? V extends ScheduleViolation ? Omit<V, 'employee_id' | 'cells'> & { cells?: ScheduleCell[] } : never
    : never;
const violation = (fields: ViolationFields): ScheduleViolation => ({ employee_id: 7, cells: [], ...fields });

describe('describeViolation', () => {
    it.each([
        ['two_shifts_same_day', violation({ code: 'two_shifts_same_day', date: SUNDAY }),
            `עובד 7: שתי משמרות ב${sunday}`],
        ['short_rest', violation({
            code: 'short_rest', rest_minutes: 465, from_previous_week: false,
            cells: [{ shift_id: 2, date: SUNDAY }, { shift_id: 1, date: MONDAY }],
        }), `עובד 7: 7:45 שעות מנוחה בין ${sunday} · ערב ל${monday} · בוקר (מינימום 7:45)`],
        ['short_rest, overlapping', violation({
            code: 'short_rest', rest_minutes: -30, from_previous_week: false,
            cells: [{ shift_id: 2, date: SUNDAY }, { shift_id: 1, date: MONDAY }],
        }), `עובד 7: משמרות חופפות בין ${sunday} · ערב ל${monday} · בוקר (מינימום 7:45)`],
        ['short_rest, from the previous week', violation({
            code: 'short_rest', rest_minutes: 420, from_previous_week: true,
            cells: [{ shift_id: 1, date: SUNDAY }],
        }), `עובד 7: 7:00 שעות מנוחה בין המשמרת האחרונה בשבוע הקודם ל${sunday} · בוקר (מינימום 7:45)`],
        ['short_rest, one cell', violation({
            code: 'short_rest', rest_minutes: 300, from_previous_week: false,
            cells: [{ shift_id: 1, date: SUNDAY }],
        }), `עובד 7: 5:00 שעות מנוחה בין המשמרת האחרונה בשבוע הקודם ל${sunday} · בוקר (מינימום 7:45)`],
        ['work_streak', violation({ code: 'work_streak', days: 7, limit: 6 }),
            'עובד 7: 7 ימי עבודה ברצף (מותר עד 6; כולל סוף השבוע הקודם)'],
        ['cannot_work', violation({ code: 'cannot_work', shift_id: 1, date: SUNDAY }),
            `עובד 7: שובץ ב${sunday} · בוקר למרות אילוץ "לא יכול"`],
        ['must_work_missed', violation({ code: 'must_work_missed', shift_ids: [1, 2], date: SUNDAY }),
            `עובד 7: לא שובץ ב${sunday} (בוקר / ערב) למרות אילוץ "חייב"`],
        ['max_shifts', violation({ code: 'max_shifts', count: 6, limit: 5 }),
            'עובד 7: 6 משמרות, מעל המקסימום השבועי (5)'],
        ['min_shifts', violation({ code: 'min_shifts', count: 1, limit: 2 }),
            'עובד 7: 1 משמרות, מתחת למינימום השבועי (2)'],
        ['position_not_held', violation({ code: 'position_not_held', position_id: 3, shift_id: 1, date: SUNDAY }),
            `עובד 7: משובץ ב${sunday} · בוקר בתפקיד role 3, שאינו מוגדר לו`],
    ])('describes %s', (_name, issue, expected) => {
        expect(describeViolation(issue, names)).toBe(expected);
    });
});

describe('useScheduleCheck', () => {
    const ASSIGNMENTS: Assignment[] = [
        { employee_id: 7, shift_id: 1, position_id: 3, date: SUNDAY },
        { employee_id: 7, shift_id: 2, position_id: 3, date: SUNDAY },
    ];
    const RESULT: ScheduleCheckResult = {
        violations: [
            violation({ code: 'two_shifts_same_day', date: SUNDAY, cells: [{ shift_id: 1, date: SUNDAY }, { shift_id: 2, date: SUNDAY }] }),
            violation({ code: 'cannot_work', shift_id: 1, date: SUNDAY, cells: [{ shift_id: 1, date: SUNDAY }] }),
        ],
    };

    const renderCheck = (locationId: number | null = 5) =>
        renderHook(
            ({ assignments }) => useScheduleCheck(locationId, SUNDAY, assignments, names),
            { initialProps: { assignments: ASSIGNMENTS } },
        );

    beforeEach(() => {
        vi.mocked(checkSchedule).mockResolvedValue(RESULT);
    });

    it('checks nothing without a location', async () => {
        const { result } = renderCheck(null);

        let checked: ScheduleCheckResult | null | undefined;
        await act(async () => { checked = await result.current.run(); });

        expect(checked).toBeNull();
        expect(checkSchedule).not.toHaveBeenCalled();
    });

    it('checks the board and marks the placements of each violation', async () => {
        const { result } = renderCheck();

        await act(() => result.current.run());

        expect(checkSchedule).toHaveBeenCalledWith(5, SUNDAY, ASSIGNMENTS);
        expect(result.current.result).toEqual(RESULT);
        expect(result.current.isChecking).toBe(false);
        const [twoShifts, cannotWork] = RESULT.violations.map(v => describeViolation(v, names));
        expect(result.current.items).toEqual([twoShifts, cannotWork]);
        expect(result.current.issuesByPlacement.get(placementKey(7, 1, SUNDAY))).toEqual([twoShifts, cannotWork]);
        expect(result.current.issuesByPlacement.get(placementKey(7, 2, SUNDAY))).toEqual([twoShifts]);
    });

    it('drops the result when the board changes', async () => {
        const { result, rerender } = renderCheck();
        await act(() => result.current.run());

        rerender({ assignments: [...ASSIGNMENTS] });

        expect(result.current.result).toBeNull();
        expect(result.current.items).toBeNull();
        expect(result.current.issuesByPlacement.size).toBe(0);
    });

    it('clears the result', async () => {
        const { result } = renderCheck();
        await act(() => result.current.run());

        act(() => result.current.clear());

        expect(result.current.result).toBeNull();
    });

    it('throws a failure to the caller', async () => {
        vi.mocked(checkSchedule).mockRejectedValue(apiError(500));
        const { result } = renderCheck();

        await act(async () => {
            await expect(result.current.run()).rejects.toBeDefined();
        });

        expect(result.current.isChecking).toBe(false);
        expect(result.current.result).toBeNull();
    });
});
