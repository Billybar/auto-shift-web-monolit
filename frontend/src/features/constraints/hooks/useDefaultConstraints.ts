// src/features/constraints/hooks/useDefaultConstraints.ts
import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saveDefaultConstraints } from '@/api/constraints';
import { defaultConstraintsQuery, employeeConstraintsKey } from '@/api/queries';
import { loadStatus } from '@/api/query';
import { notify } from '@/lib/notify';
import type { DefaultConstraint } from '@/types';
import { toggleInList } from './tapCycle';
import { constraintBoardKey } from './useWeeklyConstraints';

interface UseDefaultConstraintsProps {
    employeeId: number | undefined;
    isManager: boolean;
}

const NO_DEFAULTS: DefaultConstraint[] = [];

/**
 * The employee's default week ("אילוצים קבועים"): the marks every week they haven't saved starts with.
 */
export const useDefaultConstraints = ({ employeeId, isManager }: UseDefaultConstraintsProps) => {
    const queryClient = useQueryClient();
    const query = useQuery(defaultConstraintsQuery(employeeId));
    const server = query.data?.constraints;
    // Saving replaces the whole default week, so a failed load blocks saving
    const { isLoading, loadError } = loadStatus(query);

    // Edits stay on top of the loaded week until saved, so a refetch never overwrites them
    const [draft, setDraft] = useState<DefaultConstraint[] | null>(null);
    const defaults = draft ?? server ?? NO_DEFAULTS;

    /** Moves the cell (a board row on a day of the week) to its next mark. */
    const toggleDefault = useCallback((dayOfWeek: number, groupId: number) => {
        if (!server) return;
        setDraft(prev => toggleInList(
            prev ?? server,
            c => c.day_of_week === dayOfWeek && c.group_id === groupId,
            type => ({ group_id: groupId, day_of_week: dayOfWeek, constraint_type: type }),
            isManager
        ));
    }, [isManager, server]);

    const saveMutation = useMutation({
        mutationFn: (week: { employeeId: number; constraints: DefaultConstraint[] }) =>
            saveDefaultConstraints(week.employeeId, week.constraints),
        onSuccess: (response, week) => {
            queryClient.setQueryData(defaultConstraintsQuery(week.employeeId).queryKey, response);
            // Weeks that still show the defaults now show the new ones
            void queryClient.invalidateQueries({ queryKey: constraintBoardKey(week.employeeId) });
            void queryClient.invalidateQueries({ queryKey: employeeConstraintsKey(week.employeeId) });
        },
    });

    /** Saves the default week and reports the result to the user. Returns true when saved. */
    const saveDefaults = async (): Promise<boolean> => {
        if (!employeeId || !server) return false;
        try {
            await saveMutation.mutateAsync({ employeeId, constraints: defaults });
            // Edits made while saving stay unsaved
            setDraft(current => (current === draft ? null : current));
            notify.success('האילוצים הקבועים נשמרו', 'כל שבוע שעוד לא נשמר יתחיל מהם');
            return true;
        } catch (err) {
            notify.error(err, 'שמירת האילוצים הקבועים נכשלה');
            return false;
        }
    };

    const { refetch } = query;
    const reload = useCallback(async () => { await refetch(); }, [refetch]);

    return {
        defaults,
        isLoading,
        loadError,
        isSubmitting: saveMutation.isPending,
        toggleDefault,
        saveDefaults,
        reload,
    };
};
