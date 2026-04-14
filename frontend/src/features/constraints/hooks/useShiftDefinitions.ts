import { useState, useEffect } from 'react';
import { getShiftDefinitions } from '../../../api/shiftDefinitions';
import type { ShiftDefinition } from '../../../types';

export const useShiftDefinitions = (locationId: number | undefined) => {
    const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
    const [isLoadingShifts, setIsLoadingShifts] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Skip fetching if no location is selected
        if (!locationId) {
            setShifts([]);
            return;
        }

        const fetchShifts = async () => {
            setIsLoadingShifts(true);
            setError(null);
            try {
                const data = await getShiftDefinitions(locationId);
                // Store the fetched shift definitions
                setShifts(data);
            } catch (err: any) {
                console.error('Failed to fetch shift definitions:', err);
                setError('שגיאה בטעינת סוגי המשמרות. אנא נסה שוב.');
            } finally {
                setIsLoadingShifts(false);
            }
        };

        fetchShifts();
    }, [locationId]);

    return { shifts, isLoadingShifts, shiftsError: error };
};