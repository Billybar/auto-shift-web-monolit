// src/features/admin/hooks/useShiftForm.ts
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { logError, toAppError } from '@/api/errors';
import { invalidateLocationShifts } from '@/api/queries';
import { createShiftDefinition, updateShiftDefinition } from '@/api/shiftDefinitions';
import { notify } from '@/lib/notify';
import type { ShiftDefinition, ShiftDefinitionUpdate } from '@/types';

export interface ShiftFormValues {
    name: string;
    startTime: string; // HH:MM
    endTime: string; // HH:MM
}

const EMPTY_VALUES: ShiftFormValues = { name: '', startTime: '', endTime: '' };

interface SaveRequest {
    // The shift being edited; null adds a new one
    shiftId: number | null;
    fields: ShiftDefinitionUpdate;
}

/**
 * The add / edit shift form of a location. Saving refreshes the shift list and what is built from it
 * (the constraints-board rows and the demand template). `error` is the last failure, in Hebrew.
 */
export function useShiftForm(locationId: number | null) {
    const queryClient = useQueryClient();
    const [values, setValues] = useState<ShiftFormValues>(EMPTY_VALUES);
    const [editingShiftId, setEditingShiftId] = useState<number | null>(null);

    const mutation = useMutation({
        mutationFn: ({ shiftId, fields }: SaveRequest) => shiftId !== null
            ? updateShiftDefinition(shiftId, fields)
            : createShiftDefinition({ ...fields, location_id: locationId! }),
        onSuccess: (_shift, { shiftId }) => {
            notify.success(shiftId !== null ? 'המשמרת עודכנה' : 'המשמרת נוספה');
            return invalidateLocationShifts(queryClient, locationId!);
        },
        onError: (error) => logError('Failed to save shift:', error),
    });

    const setField = <K extends keyof ShiftFormValues>(key: K, value: ShiftFormValues[K]) => {
        setValues(prev => ({ ...prev, [key]: value }));
    };

    /** Back to an empty "new shift" form. */
    const reset = () => {
        setEditingShiftId(null);
        setValues(EMPTY_VALUES);
        mutation.reset();
    };

    const startEdit = (shift: ShiftDefinition) => {
        setEditingShiftId(shift.id);
        setValues({ name: shift.name, startTime: shift.start_time, endTime: shift.end_time });
        mutation.reset();
    };

    /** Saves the form; returns true when saved, and the form is then empty again. */
    const submit = async (): Promise<boolean> => {
        const name = values.name.trim();
        if (locationId === null || !name || !values.startTime || !values.endTime) return false;
        try {
            await mutation.mutateAsync({
                shiftId: editingShiftId,
                fields: { name, start_time: values.startTime, end_time: values.endTime },
            });
            setEditingShiftId(null);
            setValues(EMPTY_VALUES);
            return true;
        } catch {
            return false;
        }
    };

    return {
        values,
        setField,
        editingShiftId,
        isEditMode: editingShiftId !== null,
        startEdit,
        reset,
        submit,
        isSaving: mutation.isPending,
        error: mutation.error ? toAppError(mutation.error).message : null,
    };
}
