import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nextSunday, toDateStr, useScheduleWeek, weekDays } from './scheduleWeek';

describe('week dates', () => {
    it('starts on the Sunday after today', () => {
        // Wednesday 25 Nov 2026
        expect(toDateStr(nextSunday(new Date(2026, 10, 25, 15, 30)))).toBe('2026-11-29');
    });

    it('starts a week ahead on a Sunday', () => {
        expect(toDateStr(nextSunday(new Date(2026, 10, 29)))).toBe('2026-12-06');
    });

    it('runs Sunday to Saturday across a month end', () => {
        expect(weekDays(new Date(2026, 10, 29)).map(toDateStr)).toEqual([
            '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05',
        ]);
    });
});

describe('useScheduleWeek', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 10, 25, 9, 0));
    });
    afterEach(() => vi.useRealTimers());

    it('shows next week, with the Saturday before it', () => {
        const { result } = renderHook(() => useScheduleWeek());
        expect(result.current.startDate).toBe('2026-11-29');
        expect(result.current.endDate).toBe('2026-12-05');
        expect(result.current.previousDayStr).toBe('2026-11-28');
    });

    it('moves a week at a time, and keeps the dates stable between renders', () => {
        const { result, rerender } = renderHook(() => useScheduleWeek());
        const dates = result.current.dates;
        rerender();
        expect(result.current.dates).toBe(dates);

        act(() => result.current.goToNextWeek());
        expect(result.current.startDate).toBe('2026-12-06');

        act(() => result.current.goToPrevWeek());
        act(() => result.current.goToPrevWeek());
        expect(result.current.startDate).toBe('2026-11-22');
        expect(result.current.previousDayStr).toBe('2026-11-21');
    });
});
