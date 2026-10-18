// mobile/src/hooks/useWeeklyConstraints.ts
import { useState, useEffect, useCallback } from 'react';
import { getEmployeeConstraints, syncEmployeeConstraints } from '../../api/constraints';
import { logError, toAppError } from '../../api/errors';
import type { AppError } from '../../api/errors';
import { notify } from '../lib/notify';
import { addDays, upcomingSunday } from '../lib/dates';
import type { WeeklyConstraintCreate } from '../types';

interface UseWeeklyConstraintsProps {
    employeeId: number | undefined;
    isManager: boolean;
}

export const useWeeklyConstraints = ({ employeeId, isManager }: UseWeeklyConstraintsProps) => {
    // --- State Management ---
    const [constraintsList, setConstraintsList] = useState<WeeklyConstraintCreate[]>([]);
    const [note, setNote] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    // Set when the week couldn't be loaded. The screen then hides the grid and blocks saving,
    // because saving replaces the whole week (an empty list would delete every constraint).
    const [loadError, setLoadError] = useState<AppError | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    // Bumped by reload() to fetch the same week again
    const [reloadCount, setReloadCount] = useState(0);

    // Initialize syncStartDate to the upcoming Sunday
    const [syncStartDate, setSyncStartDate] = useState<string>(() => upcomingSunday());

    // Auto-calculate syncEndDate based on syncStartDate (6 days ahead)
    const syncEndDate = addDays(syncStartDate, 6);

    // --- Data Fetching ---
    useEffect(() => {
        if (!employeeId) return;
        // A response for a week the user already left must not land in the week now shown
        let isCurrent = true;

        const loadConstraints = async () => {
            setIsLoading(true);
            setLoadError(null);
            // Clear the previous week's data while fetching, so it can never be saved into this week
            setConstraintsList([]);
            setNote(null);
            try {
                // CHANGED: The API now returns a wrapper object with 'constraints' and 'note'
                const responseData = await getEmployeeConstraints(employeeId, syncStartDate, syncEndDate);
                if (!isCurrent) return;

                // CHANGED: Map over responseData.constraints instead of directly over the response
                const mapped: WeeklyConstraintCreate[] = responseData.constraints.map(c => ({
                    employee_id: c.employee_id,
                    shift_id: c.shift_id,
                    date: c.date,
                    constraint_type: c.constraint_type
                }));
                setConstraintsList(mapped);
                setNote(responseData.note || null); // ADDED: Set the note state from the response
            } catch (err) {
                if (!isCurrent) return;
                logError('Failed to fetch constraints', err);
                setLoadError(toAppError(err));
            } finally {
                if (isCurrent) setIsLoading(false);
            }
        };

        loadConstraints();
        return () => {
            isCurrent = false;
        };
    }, [employeeId, syncStartDate, syncEndDate, reloadCount]);

    const reload = useCallback(() => setReloadCount(count => count + 1), []);

    // --- Helpers & Logic ---

    // Calculate the 7 days array based on the start date
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(syncStartDate, i));

    // Handle toggling the constraint state for a specific cell
    const toggleConstraint = useCallback((date: string, shiftId: number) => {
        if (!employeeId) return;

        setConstraintsList(prevList => {
            const existingIndex = prevList.findIndex(c => c.date === date && c.shift_id === shiftId);
            const updated = [...prevList];

            if (existingIndex >= 0) {
                const existing = updated[existingIndex];

                // Clean, type-safe check relying on your ConstraintType interface
                if (existing.constraint_type === 'cannot_work') {
                    if (isManager) {
                        // Immutable update: This is what fixes the React render cycle
                        updated[existingIndex] = { ...existing, constraint_type: 'must_work' };
                    } else {
                        updated.splice(existingIndex, 1);
                    }
                } else {
                    // Current state is 'must_work'. Remove it completely.
                    updated.splice(existingIndex, 1);
                }
            } else {
                // Initial click: Add new CANNOT_WORK constraint
                updated.push({
                    employee_id: employeeId,
                    shift_id: shiftId,
                    date: date,
                    constraint_type: 'cannot_work'
                });
            }
            return updated;
        });
    }, [employeeId, isManager]);

    // --- API Interactions ---
    /**
     * Saves the week and reports the result to the user. Returns true when saved.
     */
    const saveConstraints = async (): Promise<boolean> => {
        // Never save over a week that isn't (fully) loaded: the payload would replace it with an empty list
        if (!employeeId || loadError || isLoading) return false;
        try {
            setIsSubmitting(true);
            const payload = { constraints: constraintsList, note: note };
            await syncEmployeeConstraints(employeeId, syncStartDate, syncEndDate, payload);
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
        reload
    };
};
