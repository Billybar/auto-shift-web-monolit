// src/features/location-settings/hooks/useDemandTemplate.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDemandTemplate, updateDemandTemplate } from '../../../api/locations';
import { getShiftDefinitions } from '../../../api/shiftDefinitions';
import { logError, toAppError } from '../../../api/errors';
import type { AppError } from '../../../api/errors';
import type { DemandTemplateCell, ShiftDefinition } from '../../../types';

export const MAX_REQUIRED = 50;

// Key of a template cell: "shiftId|positionId|dayOfWeek"
export const templateKey = (shiftId: number, positionId: number, dayOfWeek: number) => `${shiftId}|${positionId}|${dayOfWeek}`;

const toValues = (cells: DemandTemplateCell[]): Record<string, number> => {
    const values: Record<string, number> = {};
    cells.forEach(c => { values[templateKey(c.shift_id, c.position_id, c.day_of_week)] = c.required_employees; });
    return values;
};

/**
 * The location's weekly template (shift × role × weekday), edited locally and saved as one desired state.
 */
export function useDemandTemplate(locationId: number | null) {
    const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
    const [saved, setSaved] = useState<Record<string, number>>({});
    const [values, setValues] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadError, setLoadError] = useState<AppError | null>(null);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    const reload = useCallback(async () => {
        if (!locationId) return;
        try {
            setIsLoading(true);
            setLoadError(null);
            const [shiftsData, template] = await Promise.all([
                getShiftDefinitions(locationId),
                getDemandTemplate(locationId),
            ]);
            setShifts(shiftsData);
            setSaved(toValues(template.cells));
            setValues(toValues(template.cells));
        } catch (error) {
            logError('Failed to fetch demand template:', error);
            setLoadError(toAppError(error));
        } finally {
            setIsLoading(false);
        }
    }, [locationId]);

    useEffect(() => {
        reload();
    }, [reload]);

    const getValue = useCallback((key: string) => values[key] ?? 0, [values]);

    // Latest values for held-stepper repeats, which run from timers outside the render
    const valuesRef = useRef(values);
    useEffect(() => {
        valuesRef.current = values;
    }, [values]);

    // Returns false at a bound, so a held stepper stops repeating
    const step = useCallback((key: string, delta: 1 | -1): boolean => {
        const next = (valuesRef.current[key] ?? 0) + delta;
        if (next < 0 || next > MAX_REQUIRED) return false;
        const updated = { ...valuesRef.current, [key]: next };
        // Updated right away so the next repeat sees it even before the re-render
        valuesRef.current = updated;
        setValues(updated);
        return true;
    }, []);

    const isDirty = useMemo(() => {
        const keys = new Set([...Object.keys(saved), ...Object.keys(values)]);
        return [...keys].some(key => (saved[key] ?? 0) !== (values[key] ?? 0));
    }, [saved, values]);

    const discard = () => setValues(saved);

    /** Saves the full desired state. Throws on failure, so the editor can show why. */
    const save = async (activePositionIds: number[]) => {
        if (!locationId) return;
        const active = new Set(activePositionIds);
        const cells: DemandTemplateCell[] = Object.entries(values)
            .filter(([, required]) => required > 0)
            .map(([key, required]) => {
                const [shiftId, positionId, dayOfWeek] = key.split('|').map(Number);
                return { shift_id: shiftId, position_id: positionId, day_of_week: dayOfWeek, required_employees: required };
            })
            .filter(cell => active.has(cell.position_id));
        try {
            setIsSaving(true);
            const template = await updateDemandTemplate(locationId, cells);
            setSaved(toValues(template.cells));
            setValues(toValues(template.cells));
        } finally {
            setIsSaving(false);
        }
    };

    return { shifts, getValue, step, isDirty, discard, save, isLoading, loadError, isSaving, reload };
}
