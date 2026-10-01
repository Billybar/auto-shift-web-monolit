// frontend/src/features/schedule/hooks/useWeeklyDemand.ts
import { useState, useEffect, useCallback } from 'react';
import { getWeeklyDemand, setShiftDemandOverride } from '../../../api/shiftDefinitions';
import type { ShiftDayDemand } from '../../../types';
import { toast } from 'sonner';

export function useWeeklyDemand(locationId: number | null, startDateStr: string) {
    // Map keys are structured as "shiftId|date" (e.g., "1|2026-10-04")
    const [demandMap, setDemandMap] = useState<Record<string, ShiftDayDemand>>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    
    // Track which cells are currently waiting for a server response to prevent double-clicks
    const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());

    const fetchDemand = useCallback(async () => {
        if (!locationId || !startDateStr) return;
        
        try {
            setIsLoading(true);
            const data = await getWeeklyDemand(locationId, startDateStr);
            
            const map: Record<string, ShiftDayDemand> = {};
            data.forEach(item => {
                map[`${item.shift_id}|${item.date}`] = item;
            });
            
            setDemandMap(map);
        } catch (error) {
            console.error("Failed to fetch weekly demand:", error);
            toast.error("שגיאה בטעינת תקן המשמרות");
        } finally {
            setIsLoading(false);
        }
    }, [locationId, startDateStr]);

    // Re-fetch when location or week changes
    useEffect(() => {
        fetchDemand();
    }, [fetchDemand]);

    const changeSlots = async (shiftId: number, date: string, delta: 1 | -1) => {
        const cellKey = `${shiftId}|${date}`;
        
        // Block rapid clicks while a request for this cell is inflight
        if (pendingCells.has(cellKey)) return;

        const currentCell = demandMap[cellKey];
        if (!currentCell) return;

        const newRequired = Math.max(0, currentCell.required_employees + delta);

        // 1. Optimistic Update: Update the UI immediately before the server responds
        setPendingCells(prev => new Set(prev).add(cellKey));
        setDemandMap(prev => ({
            ...prev,
            [cellKey]: { 
                ...currentCell, 
                required_employees: newRequired, 
                // Optimistically mark as override, the server will send the true state
                is_override: true 
            }
        }));

        try {
            // 2. Network Request
            const updatedCell = await setShiftDemandOverride(shiftId, date, newRequired);
            
            // 3. Commit: Replace the optimistic cell with the exact server response
            setDemandMap(prev => ({
                ...prev,
                [cellKey]: updatedCell
            }));
        } catch (error) {
            console.error("Failed to update demand slots:", error);
            toast.error("שגיאה בעדכון מספר העמדות");
            
            // 3b. Rollback: If server failed, revert to the previous state
            setDemandMap(prev => ({
                ...prev,
                [cellKey]: currentCell
            }));
        } finally {
            // Remove from pending lock
            setPendingCells(prev => {
                const newSet = new Set(prev);
                newSet.delete(cellKey);
                return newSet;
            });
        }
    };

    return { demandMap, isLoading, pendingCells, changeSlots };
}