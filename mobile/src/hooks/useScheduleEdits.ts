// mobile/src/hooks/useScheduleEdits.ts
// Quick schedule edits for admins, managers and schedulers on a published week.
// Each edit is a pure transform of the cached week (ported from the web SchedulePage handlers),
// saved right away through Smart Sync, which replaces the whole week on the server.
import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveAssignments } from '../../api/assignments';
import type { Assignment } from '../types';

// The week being edited; also the React Query key of its assignments
export type WeekRef = { locationId: number; start: string; end: string };

// Same identity Smart Sync uses on the server: one employee in one shift on one date
export type AssignmentSlot = Pick<Assignment, 'employee_id' | 'shift_id' | 'date'>;

export type EditResult = { ok: true; next: Assignment[] } | { ok: false; reason: string };

export const assignmentsQueryKey = ({ locationId, start, end }: WeekRef) =>
    ['assignments', locationId, start, end] as const;

const ALREADY_IN_SHIFT = 'העובד כבר משובץ במשמרת הזו.';
const SLOT_MISSING = 'המשמרת השתנתה. רענן את הסידור ונסה שוב.';

// Times may arrive as "HH:MM" or "HH:MM:SS"
const toHHMM = (time: string) => time.slice(0, 5);

const isSlot = (a: Assignment, slot: AssignmentSlot) =>
    a.employee_id === slot.employee_id && a.shift_id === slot.shift_id && a.date === slot.date;

const isInCell = (week: Assignment[], employeeId: number, shiftId: number, date: string) =>
    week.some(a => a.employee_id === employeeId && a.shift_id === shiftId && a.date === date);

export function addAssignment(
    week: Assignment[], locationId: number, shiftId: number, date: string, employeeId: number
): EditResult {
    if (isInCell(week, employeeId, shiftId, date)) return { ok: false, reason: ALREADY_IN_SHIFT };
    return {
        ok: true,
        next: [...week, { location_id: locationId, employee_id: employeeId, shift_id: shiftId, date }],
    };
}

export function removeAssignment(week: Assignment[], slot: AssignmentSlot): EditResult {
    if (!week.some(a => isSlot(a, slot))) return { ok: false, reason: SLOT_MISSING };
    return { ok: true, next: week.filter(a => !isSlot(a, slot)) };
}

// Like the web's sidebar drop on an assigned chip: the new employee starts with the shift's default hours.
// Replaced in place so the chip keeps its position in the cell.
export function replaceEmployee(week: Assignment[], slot: AssignmentSlot, newEmployeeId: number): EditResult {
    if (!week.some(a => isSlot(a, slot))) return { ok: false, reason: SLOT_MISSING };
    if (isInCell(week, newEmployeeId, slot.shift_id, slot.date)) return { ok: false, reason: ALREADY_IN_SHIFT };
    return {
        ok: true,
        next: week.map(a => isSlot(a, slot)
            ? { location_id: a.location_id, employee_id: newEmployeeId, shift_id: a.shift_id, date: a.date }
            : a),
    };
}

// Like the web's chip-on-chip drop: the two employees trade slots and each slot keeps its hours
export function exchangeAssignments(week: Assignment[], first: AssignmentSlot, second: AssignmentSlot): EditResult {
    const firstIndex = week.findIndex(a => isSlot(a, first));
    const secondIndex = week.findIndex(a => isSlot(a, second));
    if (firstIndex < 0 || secondIndex < 0) return { ok: false, reason: SLOT_MISSING };

    if (first.employee_id === second.employee_id) {
        return { ok: false, reason: 'אי אפשר להחליף עובד עם עצמו.' };
    }
    if (first.shift_id === second.shift_id && first.date === second.date) {
        return { ok: false, reason: 'שני העובדים כבר באותה משמרת.' };
    }
    // Smart Sync would insert a duplicate row if an employee ended up twice in the same cell
    if (isInCell(week, second.employee_id, first.shift_id, first.date)
        || isInCell(week, first.employee_id, second.shift_id, second.date)) {
        return { ok: false, reason: 'אחד העובדים כבר משובץ במשמרת של השני.' };
    }

    const next = [...week];
    next[firstIndex] = { ...week[firstIndex], employee_id: second.employee_id };
    next[secondIndex] = { ...week[secondIndex], employee_id: first.employee_id };
    return { ok: true, next };
}

// Hours equal to the shift's default are stored as null, so only real changes are highlighted
export function setAssignmentHours(
    week: Assignment[],
    slot: AssignmentSlot,
    start: string,
    end: string,
    defaults: { start: string; end: string }
): EditResult {
    const index = week.findIndex(a => isSlot(a, slot));
    if (index < 0) return { ok: false, reason: SLOT_MISSING };

    const next = [...week];
    next[index] = {
        ...week[index],
        start_time: start === toHHMM(defaults.start) ? null : start,
        end_time: end === toHHMM(defaults.end) ? null : end,
    };
    return { ok: true, next };
}

export function useScheduleEdits(week: WeekRef) {
    const queryClient = useQueryClient();

    const { mutate, isPending } = useMutation({
        mutationFn: ({ target, next }: { target: WeekRef; next: Assignment[] }) =>
            saveAssignments(target.locationId, target.start, target.end, next),

        // Show the change immediately; keep the previous week to roll back to
        onMutate: async ({ target, next }) => {
            const queryKey = assignmentsQueryKey(target);
            await queryClient.cancelQueries({ queryKey });
            const previous = queryClient.getQueryData<Assignment[]>(queryKey);
            queryClient.setQueryData(queryKey, next);
            return { queryKey, previous };
        },

        onError: (error, _variables, rollback) => {
            console.error('Failed to save schedule edit:', error);
            if (rollback) queryClient.setQueryData(rollback.queryKey, rollback.previous);
            Alert.alert('השמירה נכשלה', 'השינוי לא נשמר. בדוק את החיבור ונסה שוב.');
        },

        // Reload the server's version of the week either way
        onSettled: (_data, _error, { target }) =>
            queryClient.invalidateQueries({ queryKey: assignmentsQueryKey(target) }),
    });

    /**
     * Runs one edit against the cached week and saves the result.
     * The payload and the date range come from the same cache entry, so a week can never be
     * saved with another week's assignments. Returns false (after alerting) when nothing was saved.
     */
    const apply = (edit: (current: Assignment[]) => EditResult): boolean => {
        const target = { ...week };
        const current = queryClient.getQueryData<Assignment[]>(assignmentsQueryKey(target));
        if (!current || isPending) return false;

        const result = edit(current);
        if (!result.ok) {
            Alert.alert('לא ניתן לבצע', result.reason);
            return false;
        }

        // One action adds or removes at most one assignment. Anything more is a bug, and since
        // Smart Sync deletes whatever is missing from the payload, it would delete real shifts.
        if (Math.abs(result.next.length - current.length) > 1) {
            Alert.alert('השינוי נחסם', 'השינוי נחסם כדי לא למחוק משמרות. רענן את הסידור ונסה שוב.');
            return false;
        }

        mutate({ target, next: result.next });
        return true;
    };

    return { apply, isSaving: isPending };
}
