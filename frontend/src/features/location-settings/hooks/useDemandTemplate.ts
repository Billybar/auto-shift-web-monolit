// src/features/location-settings/hooks/useDemandTemplate.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateDemandTemplate } from '@/api/locations';
import { demandTemplateQuery, shiftDefinitionsQuery } from '@/api/queries';
import { loadStatus } from '@/api/query';
import type { DemandTemplate, DemandTemplateCell, ShiftDefinition } from '@/types';

export const MAX_REQUIRED = 50;

// Key of a template cell: "shiftId|positionId|dayOfWeek"
export const templateKey = (shiftId: number, positionId: number, dayOfWeek: number) => `${shiftId}|${positionId}|${dayOfWeek}`;

type TemplateValues = Record<string, number>;

const toValues = (template: DemandTemplate): TemplateValues => {
    const values: TemplateValues = {};
    template.cells.forEach(c => { values[templateKey(c.shift_id, c.position_id, c.day_of_week)] = c.required_employees; });
    return values;
};

const NO_SHIFTS: ShiftDefinition[] = [];
const NO_VALUES: TemplateValues = {};

/**
 * The location's weekly template (shift × role × weekday), edited locally and saved as one desired state.
 */
export function useDemandTemplate(locationId: number | null) {
    const queryClient = useQueryClient();
    const shiftsQuery = useQuery(shiftDefinitionsQuery(locationId));
    // toValues is a stable function, so the values are rebuilt only when the template changes
    const templateQuery = useQuery({ ...demandTemplateQuery(locationId), select: toValues });
    const shifts = shiftsQuery.data ?? NO_SHIFTS;
    const saved = templateQuery.data ?? NO_VALUES;

    // Edits stay on top of the saved template until saved or discarded, so a refetch never overwrites
    // them. Tagged with their location, so another location never shows them.
    const [draft, setDraft] = useState<{ locationId: number | null; values: TemplateValues } | null>(null);
    const values = draft?.locationId === locationId ? draft.values : saved;

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
        setDraft({ locationId, values: updated });
        return true;
    }, [locationId]);

    const isDirty = useMemo(() => {
        const keys = new Set([...Object.keys(saved), ...Object.keys(values)]);
        return [...keys].some(key => (saved[key] ?? 0) !== (values[key] ?? 0));
    }, [saved, values]);

    const discard = () => setDraft(null);

    const saveMutation = useMutation({
        mutationFn: (template: { locationId: number; cells: DemandTemplateCell[] }) =>
            updateDemandTemplate(template.locationId, template.cells),
        onSuccess: (template, { locationId: savedLocationId }) => {
            queryClient.setQueryData(demandTemplateQuery(savedLocationId).queryKey, template);
        },
    });

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
        await saveMutation.mutateAsync({ locationId, cells });
        // Steps taken while saving stay unsaved
        setDraft(current => (current?.values === values ? null : current));
    };

    const refetchShifts = shiftsQuery.refetch;
    const refetchTemplate = templateQuery.refetch;
    const reload = useCallback(async () => {
        await Promise.all([refetchShifts(), refetchTemplate()]);
    }, [refetchShifts, refetchTemplate]);

    return {
        shifts,
        getValue,
        step,
        isDirty,
        discard,
        save,
        ...loadStatus(shiftsQuery, templateQuery),
        isSaving: saveMutation.isPending,
        reload,
    };
}
