// Checks the board as it is on screen against the engine's hard rules (POST /api/assignments/check)
import { useState } from 'react';

import { checkSchedule } from '../../../api/assignments';
import type { Assignment, ScheduleCell, ScheduleCheckResult, ScheduleViolation } from '../../../types';
import { formatDayLabel } from './scheduleLabels';
import type { NameLookups } from './scheduleLabels';

export const placementKey = (employeeId: number, shiftId: number, date: string) => `${employeeId}|${shiftId}|${date}`;

// 465 -> "7:45"
const formatRest = (minutes: number): string => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

const MIN_REST_LABEL = '7:45';

// One Hebrew line per violation
export const describeViolation = (issue: ScheduleViolation, names: NameLookups): string => {
    const who = names.employeeName(issue.employee_id);
    const cell = (c: ScheduleCell) => `${formatDayLabel(c.date)} · ${names.shiftName(c.shift_id)}`;

    switch (issue.code) {
        case 'two_shifts_same_day':
            return `${who}: שתי משמרות ב${formatDayLabel(issue.date)}`;
        case 'short_rest': {
            const [first, second] = issue.cells;
            const between = issue.from_previous_week || !second
                ? `בין המשמרת האחרונה בשבוע הקודם ל${cell(first)}`
                : `בין ${cell(first)} ל${cell(second)}`;
            const rest = issue.rest_minutes < 0 ? `משמרות חופפות ${between}` : `${formatRest(issue.rest_minutes)} שעות מנוחה ${between}`;
            return `${who}: ${rest} (מינימום ${MIN_REST_LABEL})`;
        }
        case 'work_streak':
            return `${who}: ${issue.days} ימי עבודה ברצף (מותר עד ${issue.limit}; כולל סוף השבוע הקודם)`;
        case 'cannot_work':
            return `${who}: שובץ ב${formatDayLabel(issue.date)} · ${names.shiftName(issue.shift_id)} למרות אילוץ "לא יכול"`;
        case 'must_work_missed':
            return `${who}: לא שובץ ב${formatDayLabel(issue.date)} (${issue.shift_ids.map(names.shiftName).join(' / ')}) למרות אילוץ "חייב"`;
        case 'max_shifts':
            return `${who}: ${issue.count} משמרות, מעל המקסימום השבועי (${issue.limit})`;
        case 'min_shifts':
            return `${who}: ${issue.count} משמרות, מתחת למינימום השבועי (${issue.limit})`;
        case 'position_not_held':
            return `${who}: משובץ ב${formatDayLabel(issue.date)} · ${names.shiftName(issue.shift_id)} בתפקיד ${names.positionName(issue.position_id)}, שאינו מוגדר לו`;
    }
};

// The last check, with the board it was run on: a result for any other board is stale
interface CheckState {
    result: ScheduleCheckResult;
    assignments: Assignment[];
    locationId: number;
    startDate: string;
}

export function useScheduleCheck(locationId: number | null, startDate: string, assignments: Assignment[], names: NameLookups) {
    const [state, setState] = useState<CheckState | null>(null);
    const [isChecking, setIsChecking] = useState(false);

    // Any edit, week change or location change replaces `assignments`, which drops the result
    const result = state && state.assignments === assignments && state.locationId === locationId && state.startDate === startDate
        ? state.result
        : null;

    // Throws when the request fails; the caller reports it
    const run = async (): Promise<ScheduleCheckResult | null> => {
        if (!locationId) return null;
        setIsChecking(true);
        try {
            const checked = await checkSchedule(locationId, startDate, assignments);
            setState({ result: checked, assignments, locationId, startDate });
            return checked;
        } finally {
            setIsChecking(false);
        }
    };

    const clear = () => setState(null);

    // Lines for the alert above the grid
    const items = result ? result.violations.map(v => describeViolation(v, names)) : null;

    // The cards to mark, with the messages of the violations each is part of
    const issuesByPlacement = new Map<string, string[]>();
    result?.violations.forEach(v => {
        const message = describeViolation(v, names);
        for (const c of v.cells) {
            const key = placementKey(v.employee_id, c.shift_id, c.date);
            issuesByPlacement.set(key, [...(issuesByPlacement.get(key) ?? []), message]);
        }
    });

    return { result, items, issuesByPlacement, isChecking, run, clear };
}
