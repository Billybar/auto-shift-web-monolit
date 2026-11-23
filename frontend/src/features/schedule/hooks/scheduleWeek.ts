// src/features/schedule/hooks/scheduleWeek.ts
// The schedule's week (Sunday to Saturday) and the page's week navigation
import { useMemo, useState } from 'react';

/** Date -> "YYYY-MM-DD" in local time, the format the API uses. */
export const toDateStr = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

/** The Sunday after `today` (a week ahead when today is Sunday), at midnight. */
export const nextSunday = (today: Date = new Date()): Date => {
    const sunday = addDays(today, 7 - today.getDay());
    sunday.setHours(0, 0, 0, 0);
    return sunday;
};

/** Identifies one location's week, e.g. to drop a result that arrives after the user moved on. */
export const boardKeyOf = (locationId: number | null, startDate: string) => `${locationId}|${startDate}`;

/** The 7 days from `start`. */
export const weekDays = (start: Date): Date[] => Array.from({ length: 7 }, (_, index) => addDays(start, index));

/**
 * The week on screen, starting next Sunday. Memoized per week, so the dates stay stable between renders.
 */
export function useScheduleWeek() {
    const [weekStart, setWeekStart] = useState<Date>(() => nextSunday());

    const week = useMemo(() => {
        const dates = weekDays(weekStart);
        const dateStrs = dates.map(toDateStr);
        // Saturday before the week: shown read-only next to Sunday
        const previousDay = addDays(weekStart, -1);
        return {
            weekStart,
            dates,
            dateStrs,
            startDate: dateStrs[0],
            endDate: dateStrs[6],
            previousDay,
            previousDayStr: toDateStr(previousDay),
        };
    }, [weekStart]);

    return {
        ...week,
        goToPrevWeek: () => setWeekStart(start => addDays(start, -7)),
        goToNextWeek: () => setWeekStart(start => addDays(start, 7)),
    };
}

export type ScheduleWeek = ReturnType<typeof useScheduleWeek>;
