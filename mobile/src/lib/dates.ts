// Calendar dates as 'YYYY-MM-DD' strings, the format the API uses (same helpers as frontend/src/lib/dates.ts).

/** The local calendar day of `date` as 'YYYY-MM-DD' (toISOString would give the UTC day). */
export const toDateStr = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Moves a 'YYYY-MM-DD' date by whole days. The math is in UTC, which has no daylight saving,
 * so a clock change (Israel moves its clocks in March and October) can't shift the result by a day.
 */
export const addDays = (dateStr: string, days: number): string => {
    const date = new Date(`${dateStr}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

/** The Sunday that starts next week, as 'YYYY-MM-DD'. On a Sunday this is the following Sunday. */
export const upcomingSunday = (today: Date = new Date()): string => addDays(toDateStr(today), 7 - today.getDay());
