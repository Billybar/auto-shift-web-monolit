// mobile/src/lib/boardRows.ts (mirrors frontend/src/features/constraints/hooks/boardRows.ts)
import type { ConstraintGroup, ShiftDefinition } from '../types';

/** A row of the constraints board: one group, standing for one or more shifts. */
export interface BoardRow {
    groupId: number;
    label: string;
    hours: string;
    shifts: ShiftDefinition[];
}

const MINUTES_PER_DAY = 24 * 60;
// The work day starts at 04:00, like app/core/shift_timing.py: a shift starting earlier is the night after its day
const WORK_DAY_START = 4 * 60;

const toMinutes = (hhmm: string): number => {
    const [hours, minutes] = hhmm.split(':').map(Number);
    return hours * 60 + minutes;
};

/** Start and end in minutes from the start of the work day; null for hours that aren't HH:MM. */
const span = (shift: ShiftDefinition): { start: number; end: number } | null => {
    const start = toMinutes(shift.start_time);
    const end = toMinutes(shift.end_time);
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    const fromDayStart = start < WORK_DAY_START ? start + MINUTES_PER_DAY : start;
    const duration = (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return { start: fromDayStart, end: fromDayStart + duration };
};

/** The row's name, else the names of its shifts. */
export const rowLabel = (group: ConstraintGroup, shifts: ShiftDefinition[]): string =>
    group.name || shifts.map(s => s.name).join(' / ');

/** The shared hours, or from the earliest start to the latest end. */
export const rowHours = (shifts: ShiftDefinition[]): string => {
    if (shifts.length === 0) return '';
    const first = shifts[0];
    if (shifts.every(s => s.start_time === first.start_time && s.end_time === first.end_time)) {
        return `${first.start_time} - ${first.end_time}`;
    }
    const spans = shifts.map(s => ({ shift: s, span: span(s) }));
    if (spans.some(s => s.span === null)) return `${first.start_time} - ${first.end_time}`;
    const earliest = spans.reduce((a, b) => (b.span!.start < a.span!.start ? b : a));
    const latest = spans.reduce((a, b) => (b.span!.end > a.span!.end ? b : a));
    return `${earliest.shift.start_time} - ${latest.shift.end_time}`;
};

/**
 * The board's rows, in the groups' order (the work day). A group whose shifts aren't loaded is left out.
 */
export const buildBoardRows = (shifts: ShiftDefinition[], groups: ConstraintGroup[]): BoardRow[] => {
    const shiftsById = new Map(shifts.map(s => [s.id, s]));
    return groups
        .map(group => {
            const groupShifts = group.shift_ids
                .map(id => shiftsById.get(id))
                .filter((s): s is ShiftDefinition => s !== undefined);
            return { groupId: group.id, label: rowLabel(group, groupShifts), hours: rowHours(groupShifts), shifts: groupShifts };
        })
        .filter(row => row.shifts.length > 0);
};
