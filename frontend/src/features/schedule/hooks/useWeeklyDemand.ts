// frontend/src/features/schedule/hooks/useWeeklyDemand.ts
import { useState, useEffect, useCallback } from 'react';
import { getWeeklyDemand, setShiftDemandOverride } from '../../../api/shiftDefinitions';
import { logError, toAppError } from '../../../api/errors';
import type { AppError } from '../../../api/errors';
import type { ShiftDayDemand } from '../../../types';
import { notify } from '../../../lib/notify';

// Key of one role's demand on one date: "shiftId|date|positionId" (e.g. "1|2026-10-04|3")
export const demandKey = (shiftId: number, date: string, positionId: number) => `${shiftId}|${date}|${positionId}`;

export function useWeeklyDemand(locationId: number | null, startDateStr: string) {
    // One cell per shift × active role × date (the server sends zeros too)
    const [demandMap, setDemandMap] = useState<Record<string, ShiftDayDemand>>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    // Set when the week's demand couldn't be loaded; the page shows an error state instead of the grid
    const [loadError, setLoadError] = useState<AppError | null>(null);

    // Track which cells are currently waiting for a server response to prevent double-clicks
    const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());

    const fetchDemand = useCallback(async () => {
        if (!locationId || !startDateStr) return;

        try {
            setIsLoading(true);
            setLoadError(null);
            const data = await getWeeklyDemand(locationId, startDateStr);

            const map: Record<string, ShiftDayDemand> = {};
            data.forEach(item => {
                map[demandKey(item.shift_id, item.date, item.position_id)] = item;
            });

            setDemandMap(map);
        } catch (error) {
            logError("Failed to fetch weekly demand:", error);
            setDemandMap({});
            setLoadError(toAppError(error));
        } finally {
            setIsLoading(false);
        }
    }, [locationId, startDateStr]);

    // Re-fetch when location or week changes
    useEffect(() => {
        fetchDemand();
    }, [fetchDemand]);

    const changeSlots = async (shiftId: number, date: string, positionId: number, delta: 1 | -1) => {
        const cellKey = demandKey(shiftId, date, positionId);

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
            const updatedCell = await setShiftDemandOverride(shiftId, date, positionId, newRequired);

            // 3. Commit: Replace the optimistic cell with the exact server response
            setDemandMap(prev => ({
                ...prev,
                [cellKey]: updatedCell
            }));
        } catch (error) {
            notify.error(error, "עדכון מספר העמדות נכשל");

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

    return { demandMap, isLoading, loadError, reload: fetchDemand, pendingCells, changeSlots };
}
