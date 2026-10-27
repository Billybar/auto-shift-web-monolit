import { useState, useEffect } from 'react';
import { getShiftDefinitions } from '../../../api/shiftDefinitions';
import { getConstraintGroups } from '../../../api/constraintGroups';
import { logError } from '../../../api/errors';
import type { ShiftDefinition } from '../../../types';
import { buildBoardRows } from './boardRows';
import type { BoardRow } from './boardRows';

/** The location's shifts, and the constraints-board rows (groups of shifts) they are marked through. */
export const useShiftDefinitions = (locationId: number | undefined) => {
    const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
    const [rows, setRows] = useState<BoardRow[]>([]);
    const [isLoadingShifts, setIsLoadingShifts] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Skip fetching if no location is selected
        if (!locationId) {
            setShifts([]);
            setRows([]);
            return;
        }

        const fetchShifts = async () => {
            setIsLoadingShifts(true);
            setError(null);
            try {
                const [shiftsData, groups] = await Promise.all([
                    getShiftDefinitions(locationId),
                    getConstraintGroups(locationId),
                ]);
                setShifts(shiftsData);
                setRows(buildBoardRows(shiftsData, groups));
            } catch (err) {
                logError('Failed to fetch shift definitions:', err);
                setRows([]);
                setError('שגיאה בטעינת סוגי המשמרות. אנא נסה שוב.');
            } finally {
                setIsLoadingShifts(false);
            }
        };

        fetchShifts();
    }, [locationId]);

    return { shifts, rows, isLoadingShifts, shiftsError: error };
};
