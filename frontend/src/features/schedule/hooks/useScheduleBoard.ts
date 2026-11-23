// src/features/schedule/hooks/useScheduleBoard.ts
import { useCallback, useMemo, useState } from 'react';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getAssignments, saveAssignments } from '../../../api/assignments';
import { employeesQuery, positionsQuery, shiftDefinitionsQuery } from '../../../api/queries';
import { loadStatus } from '../../../api/query';
import type { Assignment, Employee, Position, ShiftDefinition } from '../../../types';
import { applyDrop, removePlacement, setPlacementHours } from './scheduleEdits';
import type { DragPayload, Placement, SlotTarget } from './scheduleEdits';
import { boardKeyOf } from './scheduleWeek';

/** The saved assignments of a date range (the week, or the Saturday before it). */
export const assignmentsQuery = (locationId: number | null, startDate: string, endDate: string) => queryOptions({
    queryKey: ['assignments', locationId, startDate, endDate],
    queryFn: () => getAssignments(locationId!, startDate, endDate),
    enabled: !!locationId,
});

const NO_SHIFTS: ShiftDefinition[] = [];
const NO_POSITIONS: Position[] = [];
const NO_EMPLOYEES: Employee[] = [];
const NO_ASSIGNMENTS: Assignment[] = [];

interface BoardWeek {
    startDate: string;
    endDate: string;
    // The Saturday before the week
    previousDayStr: string;
}

interface SaveVariables {
    locationId: number;
    startDate: string;
    endDate: string;
    assignments: Assignment[];
}

/**
 * The schedule board of a location's week: shifts, roles, employees and assignments.
 * Edits stay on the board as a draft until saved; a refetch never overwrites them, and a week or
 * location change drops them.
 */
export function useScheduleBoard(locationId: number | null, week: BoardWeek, isEmployee: boolean) {
    const queryClient = useQueryClient();
    const { startDate, endDate, previousDayStr } = week;

    const shiftsQuery = useQuery(shiftDefinitionsQuery(locationId));
    // All roles of the location, archived ones included (they label past assignments)
    const positionsResult = useQuery(positionsQuery(locationId));
    const employeesResult = useQuery(employeesQuery(locationId));
    const weekQuery = useQuery(assignmentsQuery(locationId, startDate, endDate));
    // Saturday before the week, as saved: shown read-only (staff only), never part of the board,
    // since Smart Sync and the check reject dates outside the week. Context only, so a failure
    // doesn't block the board.
    const previousDayQuery = useQuery({
        ...assignmentsQuery(locationId, previousDayStr, previousDayStr),
        enabled: !!locationId && !isEmployee,
    });

    const employees = employeesResult.data ?? NO_EMPLOYEES;
    const employeesMap = useMemo(() => {
        const map: Record<number, Employee> = {};
        employees.forEach(emp => { map[emp.id] = emp; });
        return map;
    }, [employees]);

    // The draft belongs to one location and week. Reset during render, so another week never
    // shows (or saves) it, even for one frame.
    const boardKey = boardKeyOf(locationId, startDate);
    const [draft, setDraft] = useState<{ key: string; assignments: Assignment[] | null }>({ key: boardKey, assignments: null });
    if (draft.key !== boardKey) {
        setDraft({ key: boardKey, assignments: null });
    }
    const saved = weekQuery.data ?? NO_ASSIGNMENTS;
    const assignments = (draft.key === boardKey && draft.assignments) || saved;

    // Sets the draft of `key`'s week; ignored once the board shows another week
    const setDraftFor = useCallback((key: string, change: (current: Assignment[]) => Assignment[] | null) => {
        setDraft(prev => (prev.key === key ? { key, assignments: change(prev.assignments ?? saved) } : prev));
    }, [saved]);

    /** Applies a dropped chip. Returns false when refused (the employee is already in that cell). */
    const drop = (payload: DragPayload, target: SlotTarget): boolean => {
        const next = applyDrop(assignments, payload, target);
        if (!next) return false;
        if (next !== assignments) setDraftFor(boardKey, () => next);
        return true;
    };

    const remove = (placement: Placement) => setDraftFor(boardKey, current => removePlacement(current, placement));

    const setHours = (placement: Placement, startTime: string, endTime: string) =>
        setDraftFor(boardKey, current => setPlacementHours(current, placement, startTime, endTime));

    /** Replaces the board of `key`'s week, e.g. with an auto-assign draft. Ignored after a week change. */
    const replaceAll = (next: Assignment[], key: string) => setDraftFor(key, () => next);

    const saveMutation = useMutation({
        mutationFn: (v: SaveVariables) => saveAssignments(v.locationId, v.startDate, v.endDate, v.assignments),
        onSuccess: (_result, v) => {
            // The board as sent is now the saved week
            queryClient.setQueryData(assignmentsQuery(v.locationId, v.startDate, v.endDate).queryKey, v.assignments);
            // Edits made while saving stay unsaved
            setDraft(prev => (prev.assignments === v.assignments ? { ...prev, assignments: null } : prev));
        },
    });

    /** Saves the board as it is on screen (Smart Sync). Throws on failure. */
    const save = () => {
        if (!locationId) throw new Error('No location selected');
        return saveMutation.mutateAsync({ locationId, startDate, endDate, assignments });
    };

    // For the error state's retry. refetch() runs even a disabled query, so the Saturday is left to staff.
    const reload = () => {
        const queries = [shiftsQuery, positionsResult, employeesResult, weekQuery, ...(isEmployee ? [] : [previousDayQuery])];
        queries.forEach(query => void query.refetch());
    };

    return {
        shifts: shiftsQuery.data ?? NO_SHIFTS,
        positions: positionsResult.data ?? NO_POSITIONS,
        employees,
        employeesMap,
        assignments,
        // null when it failed to load
        previousDayAssignments: previousDayQuery.isLoadingError ? null : (previousDayQuery.data ?? NO_ASSIGNMENTS),
        ...loadStatus(shiftsQuery, positionsResult, employeesResult, weekQuery),
        reload,
        drop,
        remove,
        setHours,
        replaceAll,
        save,
        isSaving: saveMutation.isPending,
    };
}
