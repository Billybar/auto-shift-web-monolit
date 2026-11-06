// src/features/constraints/hooks/useDefaultConstraints.ts
import { useCallback, useEffect, useState } from 'react';
import { getDefaultConstraints, saveDefaultConstraints } from '../../../api/constraints';
import { logError, toAppError } from '../../../api/errors';
import type { AppError } from '../../../api/errors';
import { notify } from '../../../lib/notify';
import type { DefaultConstraint } from '../../../types';
import { toggleInList } from './tapCycle';

interface UseDefaultConstraintsProps {
    employeeId: number | undefined;
    isManager: boolean;
}

/**
 * The employee's default week ("אילוצים קבועים"): the marks every week they haven't saved starts with.
 */
export const useDefaultConstraints = ({ employeeId, isManager }: UseDefaultConstraintsProps) => {
    const [defaults, setDefaults] = useState<DefaultConstraint[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    // Saving replaces the whole default week, so a failed load blocks saving
    const [loadError, setLoadError] = useState<AppError | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    const load = useCallback(async () => {
        if (!employeeId) return;
        setIsLoading(true);
        setLoadError(null);
        setDefaults([]);
        try {
            const response = await getDefaultConstraints(employeeId);
            setDefaults(response.constraints);
        } catch (err) {
            logError('Failed to fetch default constraints', err);
            setLoadError(toAppError(err));
        } finally {
            setIsLoading(false);
        }
    }, [employeeId]);

    useEffect(() => {
        load();
    }, [load]);

    /** Moves the cell (a board row on a day of the week) to its next mark. */
    const toggleDefault = useCallback((dayOfWeek: number, groupId: number) => {
        setDefaults(prev => toggleInList(
            prev,
            c => c.day_of_week === dayOfWeek && c.group_id === groupId,
            type => ({ group_id: groupId, day_of_week: dayOfWeek, constraint_type: type }),
            isManager
        ));
    }, [isManager]);

    /** Saves the default week and reports the result to the user. Returns true when saved. */
    const saveDefaults = async (): Promise<boolean> => {
        if (!employeeId || loadError) return false;
        try {
            setIsSubmitting(true);
            const response = await saveDefaultConstraints(employeeId, defaults);
            setDefaults(response.constraints);
            notify.success('האילוצים הקבועים נשמרו', 'כל שבוע שעוד לא נשמר יתחיל מהם');
            return true;
        } catch (err) {
            notify.error(err, 'שמירת האילוצים הקבועים נכשלה');
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        defaults,
        isLoading,
        loadError,
        isSubmitting,
        toggleDefault,
        saveDefaults,
        reload: load,
    };
};
