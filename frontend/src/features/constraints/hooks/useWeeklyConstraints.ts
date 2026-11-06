// src/features/constraints/hooks/useWeeklyConstraints.ts
import { useState, useEffect, useCallback } from 'react';
import { getEmployeeConstraints, syncEmployeeConstraints } from '../../../api/constraints'; // Note: Ensure the path/typo matches your project
import { logError, toAppError } from '../../../api/errors';
import type { AppError } from '../../../api/errors';
import { notify } from '../../../lib/notify';
import { addDays, upcomingSunday } from '../../../lib/dates';
import type { WeeklyConstraintCreate } from '../../../types';
import { toggleInList } from './tapCycle';

interface UseWeeklyConstraintsProps {
    employeeId: number | undefined;
    isManager: boolean;
    // The week (a Sunday, YYYY-MM-DD) to open on; defaults to the upcoming Sunday
    initialStartDate?: string;
}

export const useWeeklyConstraints = ({ employeeId, isManager, initialStartDate }: UseWeeklyConstraintsProps) => {
    // --- State Management ---
    const [constraintsList, setConstraintsList] = useState<WeeklyConstraintCreate[]>([]);
    const [note, setNoteState] = useState<string | null>(null);
    // True when the week isn't saved yet and shows the employee's default constraints
    const [usesDefaults, setUsesDefaults] = useState<boolean>(false);
    // True once the user changed something since the last load or save
    const [isDirty, setIsDirty] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    // Set when the week couldn't be loaded. The board then hides the grid and blocks saving,
    // because saving replaces the whole week (an empty list would delete every constraint).
    const [loadError, setLoadError] = useState<AppError | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Initialize syncStartDate to the requested week, or the upcoming Sunday
    const [syncStartDate, setSyncStartDate] = useState<string>(() => initialStartDate ?? upcomingSunday());

    // Auto-calculate syncEndDate based on syncStartDate (6 days ahead)
    const syncEndDate = addDays(syncStartDate, 6);

    // --- Data Fetching ---
    const loadConstraints = useCallback(async () => {
        if (!employeeId) return;

        setIsLoading(true);
        setLoadError(null);
        // Clear the previous week's data while fetching, so it can never be saved into this week
        setConstraintsList([]);
        setNoteState(null);
        setUsesDefaults(false);
        setIsDirty(false);
        try {
            // CHANGED: The API now returns a wrapper object with 'constraints' and 'note'
            const responseData = await getEmployeeConstraints(employeeId, syncStartDate, syncEndDate);

            // The API returns a constraint once per shift of its board row: keep one per row and date
            const mapped: WeeklyConstraintCreate[] = [];
            const seen = new Set<string>();
            responseData.constraints.forEach(c => {
                const key = `${c.group_id}|${c.date}`;
                if (seen.has(key)) return;
                seen.add(key);
                mapped.push({
                    employee_id: c.employee_id,
                    group_id: c.group_id,
                    date: c.date,
                    constraint_type: c.constraint_type
                });
            });
            setConstraintsList(mapped);
            setNoteState(responseData.note || null);
            setUsesDefaults(responseData.uses_defaults);
        } catch (err) {
            logError("Failed to fetch constraints", err);
            setLoadError(toAppError(err));
        } finally {
            setIsLoading(false);
        }
    }, [employeeId, syncStartDate, syncEndDate]);

    useEffect(() => {
        loadConstraints();
    }, [loadConstraints]);

    // --- Helpers & Logic ---

    // Calculate the 7 days array based on the start date
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(syncStartDate, i));

    // Handle toggling the constraint state for a specific cell (a board row on a date)
    const toggleConstraint = useCallback((date: string, groupId: number) => {
        if (!employeeId) return;
        setIsDirty(true);
        setConstraintsList(prevList => toggleInList(
            prevList,
            c => c.date === date && c.group_id === groupId,
            type => ({ employee_id: employeeId, group_id: groupId, date, constraint_type: type }),
            isManager
        ));
    }, [employeeId, isManager]);

    const setNote = useCallback((value: string | null) => {
        setIsDirty(true);
        setNoteState(value);
    }, []);

    // --- API Interactions ---
    /**
     * Saves the week and reports the result to the user. Returns true when saved.
     */
    const saveConstraints = async (): Promise<boolean> => {
        // Never save over a week that didn't load: the payload would replace it with an empty list
        if (!employeeId || loadError) return false;
        try {
            setIsSubmitting(true);
            const payload = { constraints: constraintsList, note: note };
            await syncEmployeeConstraints(employeeId, syncStartDate, syncEndDate, payload);
            // The week is saved now: it keeps these marks even when the defaults change
            setUsesDefaults(false);
            setIsDirty(false);
            notify.success('האילוצים נשמרו');
            return true;
        } catch (err) {
            notify.error(err, 'שמירת האילוצים נכשלה');
            return false;
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        // State
        constraintsList,
        note,
        usesDefaults,
        isDirty,
        syncStartDate,
        syncEndDate,
        isLoading,
        loadError,
        isSubmitting,
        weekDays,
        // Actions
        setNote,
        setSyncStartDate,
        toggleConstraint,
        saveConstraints,
        reload: loadConstraints
    };
};