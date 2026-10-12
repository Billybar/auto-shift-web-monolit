// src/features/employees/hooks/useEmployeeSettingsForm.ts
import { useState } from 'react';
import type { Employee, EmployeeSettings, EmployeeSettingsUpdate } from '../../../types';

// Every field is a number in the form: empty limits from the DB are shown (and saved) with the defaults below
export type EmployeeSettingsFormValues = Required<EmployeeSettingsUpdate>;
export type EmployeeSettingsField = keyof EmployeeSettingsFormValues;

const DEFAULT_SETTINGS: EmployeeSettingsFormValues = {
    min_shifts_per_week: 0,
    max_shifts_per_week: 6,
    min_mornings: 0,
    max_mornings: 6,
    min_evenings: 0,
    max_evenings: 6,
    min_nights: 0,
    max_nights: 2,
};

export const SETTINGS_TITLE = 'הגדרת משמרות עובד';

// One row per min/max pair, shared by the form layout and the validation.
// isHard: the solver must satisfy it (total shifts); the other rows are soft limits it only penalizes.
export const SETTINGS_ROWS: { label: string; minKey: EmployeeSettingsField; maxKey: EmployeeSettingsField; isHard: boolean }[] = [
    { label: 'משמרות', minKey: 'min_shifts_per_week', maxKey: 'max_shifts_per_week', isHard: true },
    { label: 'בקרים', minKey: 'min_mornings', maxKey: 'max_mornings', isHard: false },
    { label: 'ערבים', minKey: 'min_evenings', maxKey: 'max_evenings', isHard: false },
    { label: 'לילות', minKey: 'min_nights', maxKey: 'max_nights', isHard: false },
];

const toFormValues = (settings?: EmployeeSettings | null): EmployeeSettingsFormValues => {
    const values = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as EmployeeSettingsField[]) {
        values[key] = settings?.[key] ?? DEFAULT_SETTINGS[key];
    }
    return values;
};

/**
 * Form state for an employee's shift limits (total shifts, mornings, evenings, nights).
 * Used by the full EmployeeModal and by the schedule page's EmployeeSettingsModal.
 */
export function useEmployeeSettingsForm(employee: Employee | null, isOpen: boolean) {
    const [values, setValues] = useState<EmployeeSettingsFormValues>(() => toFormValues(employee?.settings));

    // Re-populate when the modal opens or the employee changes, so Cancel + reopen discards unsaved edits.
    // Done during render (not in an effect) so the previous employee's values never flash on screen.
    const [loadedFor, setLoadedFor] = useState({ employee, isOpen });
    if (loadedFor.employee !== employee || loadedFor.isOpen !== isOpen) {
        setLoadedFor({ employee, isOpen });
        setValues(toFormValues(employee?.settings));
    }

    const setField = (key: EmployeeSettingsField, value: number) => {
        setValues(prev => ({ ...prev, [key]: value }));
    };

    // Total min/max shifts are hard solver constraints, so min > max would make auto-assign fail
    const invalidRow = SETTINGS_ROWS.find(row => values[row.minKey] > values[row.maxKey]);
    const validationError = invalidRow
        ? `מינימום ${invalidRow.label} לא יכול להיות גדול ממקסימום ${invalidRow.label}`
        : null;

    return { values, setField, validationError };
}
