// src/features/employees/EmployeeSettingsFields.tsx
import { PREFERENCE_ROWS, PREFERENCES_TITLE, SETTINGS_ROWS, SETTINGS_TITLE, SOFT_PREFERENCE_OPTIONS } from './hooks/useEmployeeSettingsForm';
import type { EmployeeSettingsField, EmployeeSettingsFormValues, LimitField } from './hooks/useEmployeeSettingsForm';
import FormField from '@/components/ui/FormField';
import { Input, Select } from '@/components/ui/Input';
import type { SoftPreference } from '@/types';

interface EmployeeSettingsFieldsProps {
    values: EmployeeSettingsFormValues;
    onFieldChange: <K extends EmployeeSettingsField>(key: K, value: EmployeeSettingsFormValues[K]) => void;
    // Validation message shown under the inputs (e.g. min greater than max)
    error?: string | null;
    // Hide the box heading when the parent shows it elsewhere (e.g. next to the employee name)
    showTitle?: boolean;
}

// Red = hard constraint (the solver must satisfy it), yellow = soft constraint (penalty only)
const HARD_COLOR = 'bg-red-50 border-red-400';
const SOFT_COLOR = 'bg-yellow-50 border-yellow-400';

/**
 * The "הגדרת משמרות עובד" box: min/max limits per shift type for one employee, and how much they
 * mind short rest and nights in a row.
 */
export default function EmployeeSettingsFields({ values, onFieldChange, error, showTitle = true }: EmployeeSettingsFieldsProps) {
    const renderInput = (label: string, key: LimitField, isHard: boolean) => (
        <FormField label={label} htmlFor={`limit-${key}`} className="flex-1">
            <Input
                id={`limit-${key}`}
                type="number" min="0" value={values[key]} onChange={(e) => onFieldChange(key, Number(e.target.value))}
                className={`p-1.5 ${isHard ? HARD_COLOR : SOFT_COLOR}`}
            />
        </FormField>
    );

    return (
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg space-y-4">
            {showTitle && <h4 className="font-semibold text-blue-800 text-sm">{SETTINGS_TITLE}</h4>}
            <div className="grid grid-cols-1 gap-4">
                {SETTINGS_ROWS.map(row => (
                    <div key={row.minKey} className="flex gap-4">
                        {renderInput(`מינ' ${row.label}`, row.minKey, row.isHard)}
                        {renderInput(`מקס ${row.label}`, row.maxKey, row.isHard)}
                    </div>
                ))}
            </div>

            {/* Preference levels: scale the site's soft weights for this employee */}
            <div className="space-y-2 border-t border-blue-100 pt-3">
                <h5 className="text-xs font-semibold text-blue-800">{PREFERENCES_TITLE}</h5>
                {PREFERENCE_ROWS.map(row => (
                    <div key={row.key} className="flex items-center justify-between gap-4">
                        <label htmlFor={`pref-${row.key}`} className="text-xs font-medium text-gray-700">{row.label}</label>
                        <Select
                            id={`pref-${row.key}`}
                            value={values[row.key]}
                            onChange={(e) => onFieldChange(row.key, e.target.value as SoftPreference)}
                            className={`w-36 p-1.5 ${SOFT_COLOR}`}
                        >
                            {SOFT_PREFERENCE_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </Select>
                    </div>
                ))}
            </div>

            {/* Color legend (bullet colors match the input borders) */}
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-gray-600">
                <li className="marker:text-red-400">אדום - אילוצים קשיחים</li>
                <li className="marker:text-yellow-400">צהוב - אילוצים שבירים</li>
            </ul>

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </div>
    );
}
