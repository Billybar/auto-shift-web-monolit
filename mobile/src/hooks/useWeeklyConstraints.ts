// mobile/src/hooks/useWeeklyConstraints.ts
import { useState, useEffect, useCallback } from 'react';
import { getEmployeeConstraints, syncEmployeeConstraints } from '../../api/constraints';
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
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Initialize syncStartDate to the upcoming Sunday
    const [syncStartDate, setSyncStartDate] = useState<string>(() => {
        const today = new Date();
        const daysUntilSunday = 7 - today.getDay();
        const nextSunday = new Date(today);
        nextSunday.setDate(today.getDate() + daysUntilSunday);
        return nextSunday.toISOString().split('T')[0];
    });

    // Auto-calculate syncEndDate based on syncStartDate (6 days ahead)
    const syncEndDate = new Date(new Date(syncStartDate).getTime() + 6 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    // --- Data Fetching ---
    useEffect(() => {
        if (!employeeId) return;

        const loadConstraints = async () => {
            setIsLoading(true);
            setConstraintsList([]); // Clear current list while fetching
            try {
                // CHANGED: The API now returns a wrapper object with 'constraints' and 'note'
                const responseData = await getEmployeeConstraints(employeeId, syncStartDate, syncEndDate);
                
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
                console.error("Failed to fetch constraints", err);
            } finally {
                setIsLoading(false);
            }
        };

        loadConstraints();
    }, [employeeId, syncStartDate, syncEndDate]);

    // --- Helpers & Logic ---

    // Calculate the 7 days array based on the start date
    const weekDays = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(syncStartDate);
        d.setDate(d.getDate() + i);
        return d.toISOString().split('T')[0];
    });

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
    const saveConstraints = async () => {
        if (!employeeId) return;
        try {
            setIsSubmitting(true);
            const payload = { constraints: constraintsList, note: note };
            await syncEmployeeConstraints(employeeId, syncStartDate, syncEndDate, payload);
            return { success: true };
        } catch (err: any) {
            console.error("Failed to sync constraints", err);
            const backendMsg = err.response?.data?.detail || "Connection error with the server.";
            return { success: false, error: backendMsg };
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
        isSubmitting,
        weekDays,
        // Actions
        setNote,
        setSyncStartDate,
        toggleConstraint,
        saveConstraints
    };
};