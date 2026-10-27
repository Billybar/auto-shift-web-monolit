// src/features/constraints/hooks/useWeeklyConstraints.ts
import { useState, useEffect, useCallback } from 'react';
import { getEmployeeConstraints, syncEmployeeConstraints } from '../../../api/constraints'; // Note: Ensure the path/typo matches your project
import { logError, toAppError } from '../../../api/errors';
import type { AppError } from '../../../api/errors';
import { notify } from '../../../lib/notify';
import { addDays, upcomingSunday } from '../../../lib/dates';
import type { WeeklyConstraintCreate } from '../../../types';

interface UseWeeklyConstraintsProps {
    employeeId: number | undefined;
    isManager: boolean;
}

export const useWeeklyConstraints = ({ employeeId, isManager }: UseWeeklyConstraintsProps) => {
    // --- State Management ---
    const [constraintsList, setConstraintsList] = useState<WeeklyConstraintCreate[]>([]);
    const [note, setNote] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    // Set when the week couldn't be loaded. The board then hides the grid and blocks saving,
    // because saving replaces the whole week (an empty list would delete every constraint).
    const [loadError, setLoadError] = useState<AppError | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Initialize syncStartDate to the upcoming Sunday
    const [syncStartDate, setSyncStartDate] = useState<string>(() => upcomingSunday());

    // Auto-calculate syncEndDate based on syncStartDate (6 days ahead)
    const syncEndDate = addDays(syncStartDate, 6);

    // --- Data Fetching ---
    const loadConstraints = useCallback(async () => {
        if (!employeeId) return;

        setIsLoading(true);
        setLoadError(null);
        // Clear the previous week's data while fetching, so it can never be saved into this week
        setConstraintsList([]);
        setNote(null);
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
            setNote(responseData.note || null); // ADDED: Set the note state from the response
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

        setConstraintsList(prevList => {
            const existingIndex = prevList.findIndex(c => c.date === date && c.group_id === groupId);
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
                    group_id: groupId,
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
        // Never save over a week that didn't load: the payload would replace it with an empty list
        if (!employeeId || loadError) return false;
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
        reload: loadConstraints
    };
};