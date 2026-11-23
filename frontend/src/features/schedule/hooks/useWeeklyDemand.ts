// frontend/src/features/schedule/hooks/useWeeklyDemand.ts
import { useCallback, useState } from 'react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { getWeeklyDemand, setShiftDemandOverride } from '../../../api/shiftDefinitions';
import { loadStatus } from '../../../api/query';
import type { ShiftDayDemand } from '../../../types';
import { notify } from '../../../lib/notify';

// Key of one role's demand on one date: "shiftId|date|positionId" (e.g. "1|2026-10-04|3")
export const demandKey = (shiftId: number, date: string, positionId: number) => `${shiftId}|${date}|${positionId}`;

type DemandMap = Record<string, ShiftDayDemand>;

const NO_DEMAND: DemandMap = {};

// One cell per shift × active role × date (the server sends zeros too)
const weeklyDemandQuery = (locationId: number | null, startDate: string) => queryOptions({
    queryKey: ['weeklyDemand', locationId, startDate],
    queryFn: async (): Promise<DemandMap> => {
        const data = await getWeeklyDemand(locationId!, startDate);
        const map: DemandMap = {};
        data.forEach(item => {
            map[demandKey(item.shift_id, item.date, item.position_id)] = item;
        });
        return map;
    },
    enabled: !!locationId && !!startDate,
});

export function useWeeklyDemand(locationId: number | null, startDateStr: string) {
    const queryClient = useQueryClient();
    const query = useQuery(weeklyDemandQuery(locationId, startDateStr));
    const demandMap = query.data ?? NO_DEMAND;
    // loadError is set when the week's demand couldn't be loaded; the page shows an error state instead of the grid
    const { isLoading, loadError } = loadStatus(query);

    // Track which cells are currently waiting for a server response to prevent double-clicks
    const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());

    const changeSlots = async (shiftId: number, date: string, positionId: number, delta: 1 | -1) => {
        if (!locationId) return;
        const cellKey = demandKey(shiftId, date, positionId);

        // Block rapid clicks while a request for this cell is inflight
        if (pendingCells.has(cellKey)) return;

        const currentCell = demandMap[cellKey];
        if (!currentCell) return;

        const newRequired = Math.max(0, currentCell.required_employees + delta);
        // The week the click was on, even if the user moves to another week before the answer
        const { queryKey } = weeklyDemandQuery(locationId, startDateStr);
        const setCell = (cell: ShiftDayDemand) =>
            queryClient.setQueryData(queryKey, prev => (prev ? { ...prev, [cellKey]: cell } : prev));

        setPendingCells(prev => new Set(prev).add(cellKey));
        // A refetch in flight would land on top of the optimistic value with the old one
        await queryClient.cancelQueries({ queryKey });

        // 1. Optimistic Update: Update the UI immediately before the server responds
        // (marked as an override; the server sends the true state)
        setCell({ ...currentCell, required_employees: newRequired, is_override: true });

        try {
            // 2. Commit: Replace the optimistic cell with the exact server response
            setCell(await setShiftDemandOverride(shiftId, date, positionId, newRequired));
        } catch (error) {
            notify.error(error, "עדכון מספר העמדות נכשל");
            // 3. Rollback: If server failed, revert to the previous state
            setCell(currentCell);
        } finally {
            // Remove from pending lock
            setPendingCells(prev => {
                const newSet = new Set(prev);
                newSet.delete(cellKey);
                return newSet;
            });
        }
    };

    const { refetch } = query;
    const reload = useCallback(async () => { await refetch(); }, [refetch]);

    return { demandMap, isLoading, loadError, reload, pendingCells, changeSlots };
}
