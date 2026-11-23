// src/features/employees/hooks/useEmployeeSettingsForm.ts
import { useState } from 'react';
import type { Employee, EmployeeSettings, EmployeeSettingsUpdate, SoftPreference } from '../../../types';

// Every field has a value in the form: empty limits from the DB are shown (and saved) with the defaults below
export type EmployeeSettingsFormValues = Required<EmployeeSettingsUpdate>;
export type EmployeeSettingsField = keyof EmployeeSettingsFormValues;
export type PreferenceField =
    | 'rest_gap_pref'
    | 'two_rest_gaps_pref'
    | 'two_consecutive_nights_pref'
    | 'consecutive_nights_pref';
export type LimitField = Exclude<EmployeeSettingsField, PreferenceField>;

const DEFAULT_SETTINGS: EmployeeSettingsFormValues = {
    min_shifts_per_week: 0,
    max_shifts_per_week: 6,
    min_mornings: 0,
    max_mornings: 6,
    min_evenings: 0,
    max_evenings: 6,
    min_nights: 0,
    max_nights: 2,
    rest_gap_pref: 'normal',
    two_rest_gaps_pref: 'normal',
    two_consecutive_nights_pref: 'normal',
    consecutive_nights_pref: 'normal',
};

export const SETTINGS_TITLE = 'הגדרת משמרות עובד';

// One row per min/max pair, shared by the form layout and the validation.
// isHard: the solver must satisfy it (total shifts); the other rows are soft limits it only penalizes.
export const SETTINGS_ROWS: { label: string; minKey: LimitField; maxKey: LimitField; isHard: boolean }[] = [
    { label: 'משמרות', minKey: 'min_shifts_per_week', maxKey: 'max_shifts_per_week', isHard: true },
    { label: 'בקרים', minKey: 'min_mornings', maxKey: 'max_mornings', isHard: false },
    { label: 'ערבים', minKey: 'min_evenings', maxKey: 'max_evenings', isHard: false },
    { label: 'לילות', minKey: 'min_nights', maxKey: 'max_nights', isHard: false },
];

// How much the employee minds each soft penalty; the solver scales the site's weight by the level
export const PREFERENCES_TITLE = 'העדפות מנוחה ולילות';

export const PREFERENCE_ROWS: { label: string; key: PreferenceField }[] = [
    { label: 'מנוחה קצרה בין משמרות', key: 'rest_gap_pref' },
    { label: '2 מנוחות קצרות ברצף', key: 'two_rest_gaps_pref' },
    { label: '2 לילות ברצף', key: 'two_consecutive_nights_pref' },
    { label: '3 לילות ברצף', key: 'consecutive_nights_pref' },
];

// In order from "doesn't mind" to "really minds"; the multipliers are in SOFT_PREFERENCE_MULTIPLIER (backend)
export const SOFT_PREFERENCE_OPTIONS: { value: SoftPreference; label: string }[] = [
    { value: 'dont_care', label: 'לא אכפת לי' },
    { value: 'normal', label: 'רגיל' },
    { value: 'prefer_not', label: 'מעדיף שלא' },
    { value: 'avoid', label: 'ממש מעדיף שלא' },
];

// The saved values of the form's fields, over the defaults (an empty limit keeps its default)
const toFormValues = (settings?: EmployeeSettings | null): EmployeeSettingsFormValues => {
    const saved = Object.fromEntries(
        Object.entries(settings ?? {}).filter(([key, value]) => key in DEFAULT_SETTINGS && value != null),
    ) as Partial<EmployeeSettingsFormValues>;
    return { ...DEFAULT_SETTINGS, ...saved };
};

/**
 * Form state for an employee's shift limits (total shifts, mornings, evenings, nights) and their
 * rest / nights-in-a-row preference levels.
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

    const setField = <K extends EmployeeSettingsField>(key: K, value: EmployeeSettingsFormValues[K]) => {
        setValues(prev => ({ ...prev, [key]: value }));
    };

    // Total min/max shifts are hard solver constraints, so min > max would make auto-assign fail
    const invalidRow = SETTINGS_ROWS.find(row => values[row.minKey] > values[row.maxKey]);
    const validationError = invalidRow
        ? `מינימום ${invalidRow.label} לא יכול להיות גדול ממקסימום ${invalidRow.label}`
        : null;

    return { values, setField, validationError };
}
