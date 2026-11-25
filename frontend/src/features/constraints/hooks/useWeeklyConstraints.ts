// src/features/constraints/hooks/useWeeklyConstraints.ts
import { useState, useCallback } from 'react';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getEmployeeConstraints, syncEmployeeConstraints } from '@/api/constraints';
import { constraintSubmissionsKey, employeeConstraintsKey } from '@/api/queries';
import { loadStatus } from '@/api/query';
import { notify } from '@/lib/notify';
import { addDays, upcomingSunday } from '@/lib/dates';
import type { WeeklyConstraintCreate } from '@/types';
import { toggleInList } from './tapCycle';

interface UseWeeklyConstraintsProps {
    employeeId: number | undefined;
    isManager: boolean;
    // The week (a Sunday, YYYY-MM-DD) to open on; defaults to the upcoming Sunday
    initialStartDate?: string;
}

// One week as the board edits it
interface WeekBoard {
    // One mark per board row and date
    constraints: WeeklyConstraintCreate[];
    note: string | null;
    // True when the week isn't saved yet and shows the employee's default constraints
    usesDefaults: boolean;
}

// The user's unsaved edits of the shown week
type WeekDraft = Pick<WeekBoard, 'constraints' | 'note'>;

const NO_CONSTRAINTS: WeeklyConstraintCreate[] = [];

/** Every week of the employee's board starts with this key. */
export const constraintBoardKey = (employeeId: number) => ['constraintBoard', employeeId] as const;

const constraintBoardQuery = (employeeId: number | undefined, startDate: string, endDate: string) => queryOptions({
    queryKey: [...constraintBoardKey(employeeId ?? 0), startDate],
    queryFn: async (): Promise<WeekBoard> => {
        const response = await getEmployeeConstraints(employeeId!, startDate, endDate);
        // The API returns a constraint once per shift of its board row: keep one per row and date
        const constraints: WeeklyConstraintCreate[] = [];
        const seen = new Set<string>();
        response.constraints.forEach(c => {
            const key = `${c.group_id}|${c.date}`;
            if (seen.has(key)) return;
            seen.add(key);
            constraints.push({
                employee_id: c.employee_id,
                group_id: c.group_id,
                date: c.date,
                constraint_type: c.constraint_type
            });
        });
        return { constraints, note: response.note || null, usesDefaults: response.uses_defaults };
    },
    enabled: !!employeeId,
});

export const useWeeklyConstraints = ({ employeeId, isManager, initialStartDate }: UseWeeklyConstraintsProps) => {
    const queryClient = useQueryClient();

    // Initialize syncStartDate to the requested week, or the upcoming Sunday
    const [syncStartDate, setStartDate] = useState<string>(() => initialStartDate ?? upcomingSunday());

    // Auto-calculate syncEndDate based on syncStartDate (6 days ahead)
    const syncEndDate = addDays(syncStartDate, 6);

    // --- Data Fetching ---
    // A week that isn't loaded yet has no data (never the previous week's), so it can't be saved over.
    const query = useQuery(constraintBoardQuery(employeeId, syncStartDate, syncEndDate));
    const server = query.data;
    // Set when the week couldn't be loaded. The board then hides the grid and blocks saving,
    // because saving replaces the whole week (an empty list would delete every constraint).
    const { isLoading, loadError } = loadStatus(query);

    // Edits stay on top of the loaded week until saved, so a refetch never overwrites them
    const [draft, setDraft] = useState<WeekDraft | null>(null);

    const constraintsList = draft?.constraints ?? server?.constraints ?? NO_CONSTRAINTS;
    const note = draft ? draft.note : server?.note ?? null;

    // Moving to another week drops the unsaved edits of this one
    const setSyncStartDate = useCallback((date: string) => {
        setDraft(null);
        setStartDate(date);
    }, []);

    // --- Helpers & Logic ---

    // Calculate the 7 days array based on the start date
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(syncStartDate, i));

    // Handle toggling the constraint state for a specific cell (a board row on a date)
    const toggleConstraint = useCallback((date: string, groupId: number) => {
        if (!employeeId || !server) return;
        setDraft(prev => {
            const base = prev ?? server;
            return {
                note: base.note,
                constraints: toggleInList(
                    base.constraints,
                    c => c.date === date && c.group_id === groupId,
                    type => ({ employee_id: employeeId, group_id: groupId, date, constraint_type: type }),
                    isManager
                ),
            };
        });
    }, [employeeId, isManager, server]);

    const setNote = useCallback((value: string | null) => {
        if (!server) return;
        setDraft(prev => ({ constraints: (prev ?? server).constraints, note: value }));
    }, [server]);

    // --- API Interactions ---
    const saveMutation = useMutation({
        mutationFn: (week: { employeeId: number; startDate: string; endDate: string; draft: WeekDraft }) =>
            syncEmployeeConstraints(week.employeeId, week.startDate, week.endDate, week.draft),
        onSuccess: (_response, week) => {
            // The week is saved now: it keeps these marks even when the defaults change
            queryClient.setQueryData(
                constraintBoardQuery(week.employeeId, week.startDate, week.endDate).queryKey,
                { ...week.draft, usesDefaults: false }
            );
            // The schedule's hover cards and "not submitted" markers
            void queryClient.invalidateQueries({ queryKey: employeeConstraintsKey(week.employeeId) });
            void queryClient.invalidateQueries({ queryKey: constraintSubmissionsKey });
        },
    });

    /**
     * Saves the week and reports the result to the user. Returns true when saved.
     */
    const saveConstraints = async (): Promise<boolean> => {
        // Never save over a week that didn't load: the payload would replace it with an empty list
        if (!employeeId || !server) return false;
        const shown = draft ?? server;
        const saved: WeekDraft = { constraints: shown.constraints, note: shown.note };
        try {
            await saveMutation.mutateAsync({ employeeId, startDate: syncStartDate, endDate: syncEndDate, draft: saved });
            // Edits made while saving stay unsaved
            setDraft(current => (current === draft ? null : current));
            notify.success('האילוצים נשמרו');
            return true;
        } catch (err) {
            notify.error(err, 'שמירת האילוצים נכשלה');
            return false;
        }
    };

    const { refetch } = query;
    const reload = useCallback(async () => { await refetch(); }, [refetch]);

    return {
        // State
        constraintsList,
        note,
        usesDefaults: server?.usesDefaults ?? false,
        // True once the user changed something since the last load or save
        isDirty: draft !== null,
        syncStartDate,
        syncEndDate,
        isLoading,
        loadError,
        isSubmitting: saveMutation.isPending,
        weekDays,
        // Actions
        setNote,
        setSyncStartDate,
        toggleConstraint,
        saveConstraints,
        reload
    };
};
