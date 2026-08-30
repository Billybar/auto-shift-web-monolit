// mobile/src/hooks/useWeeklyConstraints.ts
import { useState, useEffect, useCallback } from 'react';
import { getEmployeeConstraints, syncEmployeeConstraints } from '../../api/constraints';
import type { WeeklyConstraintCreate } from '../types';

interface UseWeeklyConstraintsProps {
    employeeId: number | undefined;
}

export const useWeeklyConstraints = ({ employeeId }: UseWeeklyConstraintsProps) => {
    const [constraintsList, setConstraintsList] = useState<WeeklyConstraintCreate[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Default to upcoming Sunday
    const [syncStartDate, setSyncStartDate] = useState<string>(() => {
        const today = new Date();
        const daysUntilSunday = 7 - today.getDay();
        const nextSunday = new Date(today);
        nextSunday.setDate(today.getDate() + daysUntilSunday);
        return nextSunday.toISOString().split('T')[0];
    });

    const syncEndDate = new Date(new Date(syncStartDate).getTime() + 6 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    useEffect(() => {
        if (!employeeId) return;

        const loadConstraints = async () => {
            setIsLoading(true);
            setConstraintsList([]);
            try {
                const existing = await getEmployeeConstraints(employeeId, syncStartDate, syncEndDate);
                const mapped: WeeklyConstraintCreate[] = existing.map(c => ({
                    employee_id: c.employee_id,
                    shift_id: c.shift_id,
                    date: c.date,
                    constraint_type: c.constraint_type
                }));
                setConstraintsList(mapped);
            } catch (err) {
                console.error("Failed to fetch constraints", err);
            } finally {
                setIsLoading(false);
            }
        };

        loadConstraints();
    }, [employeeId, syncStartDate, syncEndDate]);

    const weekDays = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(syncStartDate);
        d.setDate(d.getDate() + i);
        return d.toISOString().split('T')[0];
    });

    const toggleConstraint = useCallback((date: string, shiftId: number) => {
        if (!employeeId) return;

        setConstraintsList(prevList => {
            const existingIndex = prevList.findIndex(c => c.date === date && c.shift_id === shiftId);
            const updated = [...prevList];
            
            if (existingIndex >= 0) {
                // Employee can only toggle between 'cannot_work' and 'free' (removed from list)
                updated.splice(existingIndex, 1);
            } else {
                updated.push({
                    employee_id: employeeId,
                    shift_id: shiftId,
                    date: date,
                    constraint_type: 'cannot_work' // Employee default
                });
            }
            return updated;
        });
    }, [employeeId]);

    const saveConstraints = async () => {
        if (!employeeId) return;
        try {
            setIsSubmitting(true);
            await syncEmployeeConstraints(employeeId, syncStartDate, syncEndDate, constraintsList);
            return { success: true };
        } catch (err: any) {
            console.error("Failed to sync constraints", err);
            return { success: false, error: err.message || "Error" };
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        constraintsList,
        syncStartDate,
        isLoading,
        isSubmitting,
        weekDays,
        setSyncStartDate,
        toggleConstraint,
        saveConstraints
    };
};