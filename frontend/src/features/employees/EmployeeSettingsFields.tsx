// src/features/employees/EmployeeSettingsFields.tsx
import { SETTINGS_ROWS, SETTINGS_TITLE } from './hooks/useEmployeeSettingsForm';
import type { EmployeeSettingsField, EmployeeSettingsFormValues } from './hooks/useEmployeeSettingsForm';

interface EmployeeSettingsFieldsProps {
    values: EmployeeSettingsFormValues;
    onFieldChange: (key: EmployeeSettingsField, value: number) => void;
    // Validation message shown under the inputs (e.g. min greater than max)
    error?: string | null;
    // Hide the box heading when the parent shows it elsewhere (e.g. next to the employee name)
    showTitle?: boolean;
}

// Red = hard constraint (the solver must satisfy it), yellow = soft constraint (penalty only)
const HARD_COLOR = 'bg-red-50 border-red-400';
const SOFT_COLOR = 'bg-yellow-50 border-yellow-400';

/**
 * The "הגדרת משמרות עובד" box: min/max limits per shift type for one employee.
 */
export default function EmployeeSettingsFields({ values, onFieldChange, error, showTitle = true }: EmployeeSettingsFieldsProps) {
    const renderInput = (label: string, key: EmployeeSettingsField, isHard: boolean) => (
        <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
            <input
                type="number" min="0" value={values[key]} onChange={(e) => onFieldChange(key, Number(e.target.value))}
                className={`w-full border rounded p-1.5 text-sm ${isHard ? HARD_COLOR : SOFT_COLOR}`}
            />
        </div>
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

            {/* Color legend (bullet colors match the input borders) */}
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-gray-600">
                <li className="marker:text-red-400">אדום - אילוצים קשיחים</li>
                <li className="marker:text-yellow-400">צהוב - אילוצים שבירים</li>
            </ul>

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </div>
    );
}
