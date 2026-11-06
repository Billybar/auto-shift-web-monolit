// src/features/constraints/components/WeeklyConstraintsBoard.tsx
import { useState } from 'react';
import { useWeeklyConstraints } from './hooks/useWeeklyConstraints';
import { useDefaultConstraints } from './hooks/useDefaultConstraints';
import { Save, XCircle, CalendarDays } from 'lucide-react';
import { useShiftDefinitions } from './hooks/useShiftDefinitions';
import { useAppLocation } from '../../context/LocationContext';
import InlineAlert from '../../components/ui/InlineAlert';
import ConstraintsGrid, { type GridColumn } from './components/ConstraintsGrid';

export interface WeeklyConstraintsBoardProps {
    employeeId: number;
    employeeName: string;
    isManager: boolean;
    onCancel?: () => void;
    // Called after the week is saved (not after the default week is saved)
    onSaveSuccess?: () => void;
    // Called after the default week is saved
    onDefaultsSaveSuccess?: () => void;
    // Locks the board to this week (a Sunday, YYYY-MM-DD) and hides the week picker
    weekStart?: string;
}

type BoardMode = 'week' | 'defaults';

// 0 = Sunday ... 6 = Saturday, like the API's day_of_week
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DEFAULT_COLUMNS: GridColumn[] = DAY_NAMES.map((name, day) => ({ key: String(day), title: name }));

const MODES: { mode: BoardMode; label: string }[] = [
    { mode: 'week', label: 'אילוצים לשבוע' },
    { mode: 'defaults', label: 'אילוצים קבועים' },
];

export default function WeeklyConstraintsBoard({
    employeeId,
    employeeName,
    isManager,
    onCancel,
    onSaveSuccess,
    onDefaultsSaveSuccess,
    weekStart
}: WeeklyConstraintsBoardProps) {

    // Get the selected location ID from the global context
    const { selectedLocationId } = useAppLocation();

    // Check if a valid location is selected (must be a number)
    const hasValidLocation = typeof selectedLocationId === 'number';

    // Fetch the board rows (groups of shifts) safely by providing a numeric fallback (0)
    // to satisfy TypeScript when no location is selected.
    const { rows, isLoadingShifts, shiftsError } = useShiftDefinitions(
        hasValidLocation ? selectedLocationId : 0
    );

    const [mode, setMode] = useState<BoardMode>('week');

    // Both boards stay loaded, so switching between them keeps unsaved edits
    const weekly = useWeeklyConstraints({ employeeId, isManager, initialStartDate: weekStart });
    const defaults = useDefaultConstraints({ employeeId, isManager });

    const isWeek = mode === 'week';
    const isLoading = isWeek ? weekly.isLoading : defaults.isLoading;
    const loadError = isWeek ? weekly.loadError : defaults.loadError;
    const isSubmitting = isWeek ? weekly.isSubmitting : defaults.isSubmitting;
    const isOverlayLoading = isLoading || isLoadingShifts;

    const weekColumns: GridColumn[] = weekly.weekDays.map((date) => ({
        key: date,
        title: new Date(date).toLocaleDateString('he-IL', { weekday: 'short' }),
        subtitle: date.split('-').reverse().join('/'),
    }));

    const handleSave = async () => {
        if (isWeek) {
            // The hook reports success or failure to the user; this only tells the parent
            if (await weekly.saveConstraints()) onSaveSuccess?.();
            return;
        }
        if (!await defaults.saveDefaults()) return;
        // A week that still shows the defaults (and wasn't edited) now shows the new ones
        if (weekly.usesDefaults && !weekly.isDirty) weekly.reload();
        onDefaultsSaveSuccess?.();
    };

    return (
        <div className="flex flex-col w-full bg-white rounded-xl" dir="rtl">
            {/* Header Section */}
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <CalendarDays className="text-blue-600" />
                       אילוצים עבור:  {employeeName}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {isManager
                            ? 'לחץ על תא: פנוי ➔ לא יכול ➔ מעדיף ➔ חייב'
                            : 'לחץ על תא כדי לשנות: פנוי ➔ לא יכול ➔ מעדיף'}
                    </p>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                    {/* Board mode: one week, or the default week every unsaved week starts with */}
                    <div role="tablist" className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                        {MODES.map(({ mode: option, label }) => (
                            <button
                                key={option}
                                role="tab"
                                aria-selected={mode === option}
                                onClick={() => setMode(option)}
                                disabled={isSubmitting}
                                className={`px-3 py-1.5 text-sm rounded-md transition font-medium ${
                                    mode === option ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Week Selection (hidden when the parent locks the week) */}
                    {isWeek && !weekStart && (
                        <div className="bg-gray-50 p-2 rounded-lg border border-gray-200">
                            <label className="block text-xs font-medium text-gray-700 mb-1">תאריך תחילת שבוע</label>
                            <input
                                type="date"
                                value={weekly.syncStartDate}
                                // Clearing the field gives '', which isn't a week; keep the current one
                                onChange={(e) => { if (e.target.value) weekly.setSyncStartDate(e.target.value); }}
                                className="border border-gray-300 rounded p-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Error banner for shift definitions */}
            {shiftsError && <InlineAlert variant="error" className="mb-4">{shiftsError}</InlineAlert>}

            {isWeek && weekly.usesDefaults && !weekly.loadError && (
                <InlineAlert variant="info" className="mb-4">
                    השבוע מולא מהאילוצים הקבועים ועדיין לא נשמר. שמירה תקבע אותו לשבוע הזה.
                </InlineAlert>
            )}
            {!isWeek && (
                <InlineAlert variant="info" className="mb-4">
                    האילוצים הקבועים ממלאים כל שבוע שעוד לא נשמר. שבוע שנשמר או פורסם לא משתנה.
                </InlineAlert>
            )}

            {/* If the board didn't load, show why instead of an empty grid that could be saved over it */}
            {loadError ? (
                <InlineAlert
                    variant="error"
                    title={isWeek ? 'טעינת האילוצים נכשלה' : 'טעינת האילוצים הקבועים נכשלה'}
                    action={{ label: 'נסה שוב', onClick: isWeek ? weekly.reload : defaults.reload }}
                    className="mb-4"
                >
                    {loadError.message}
                </InlineAlert>
            ) : isWeek ? (
                <ConstraintsGrid
                    columns={weekColumns}
                    rows={rows}
                    isLoading={weekly.isLoading}
                    isLoadingShifts={isLoadingShifts}
                    getType={(date, groupId) =>
                        weekly.constraintsList.find(c => c.date === date && c.group_id === groupId)?.constraint_type}
                    onToggle={weekly.toggleConstraint}
                />
            ) : (
                <ConstraintsGrid
                    columns={DEFAULT_COLUMNS}
                    rows={rows}
                    isLoading={defaults.isLoading}
                    isLoadingShifts={isLoadingShifts}
                    getType={(day, groupId) =>
                        defaults.defaults.find(c => c.day_of_week === Number(day) && c.group_id === groupId)?.constraint_type}
                    onToggle={(day, groupId) => defaults.toggleDefault(Number(day), groupId)}
                />
            )}

            {/* Weekly Note Textarea Section (a note belongs to one week) */}
            {isWeek && (
                <div className="mb-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        הערות לשבוע זה:
                    </label>
                    <textarea
                        rows={2}
                        value={weekly.note || ''}
                        onChange={(e) => weekly.setNote(e.target.value)}
                        disabled={isOverlayLoading || isSubmitting || !!weekly.loadError}
                        className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y min-h-[56px]"
                    />
                </div>
            )}

            {/* Bottom Actions Section - sticks to the bottom of the nearest scroller (page main / modal body) */}
            <div className="sticky bottom-0 z-20 bg-white flex justify-end gap-3 pt-3 pb-1 border-t border-gray-200">
                {onCancel && (
                    <button
                        onClick={onCancel}
                        disabled={isSubmitting}
                        className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition font-medium flex items-center gap-2"
                    >
                        <XCircle size={18} />
                        ביטול
                    </button>
                )}
                <button
                    onClick={handleSave}
                    // Disable save if submitting, loading, the board failed to load, no rows, or no valid location
                    disabled={isSubmitting || isOverlayLoading || !!loadError || !!shiftsError || rows.length === 0 || !hasValidLocation}
                    className="flex items-center gap-2 px-5 py-2 font-medium text-white transition rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                    >
                    <Save size={18} />
                    {isSubmitting ? 'שומר...' : isWeek ? 'שמור אילוצים' : 'שמור אילוצים קבועים'}
                </button>
            </div>
        </div>
    );
}
