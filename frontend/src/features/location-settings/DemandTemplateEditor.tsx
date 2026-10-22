// src/features/location-settings/DemandTemplateEditor.tsx
import { useState } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { Minus, Plus, Save, Undo2 } from 'lucide-react';

import { logError, toAppError } from '../../api/errors';
import InlineAlert from '../../components/ui/InlineAlert';
import { notify } from '../../lib/notify';
import type { Position } from '../../types';
import PositionBadge from '../positions/PositionBadge';
import { useHoldRepeat } from '../schedule/hooks/useHoldRepeat';
import { MAX_REQUIRED, templateKey, useDemandTemplate } from './hooks/useDemandTemplate';

// 0 = Sunday … 6 = Saturday, like ShiftDemand.day_of_week
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

interface DemandTemplateEditorProps {
    locationId: number;
    // Active roles, in display order
    positions: Position[];
}

/**
 * The weekly template (תקן שבועי): how many people each shift needs in each role on each weekday.
 * Saved as one desired state; changes for a specific date are made on the schedule board.
 */
export default function DemandTemplateEditor({ locationId, positions }: DemandTemplateEditorProps) {
    const { shifts, getValue, step, isDirty, discard, save, isLoading, loadError, isSaving, reload } = useDemandTemplate(locationId);
    const [saveError, setSaveError] = useState<string | null>(null);
    const { start: startHold, stop: stopHold } = useHoldRepeat();

    // Steps on press and repeats while held; a keyboard click (detail 0) steps once
    const stepperHandlers = (key: string, delta: 1 | -1) => ({
        onPointerDown: (e: PointerEvent) => {
            if (e.button === 0) startHold(() => step(key, delta));
        },
        onPointerLeave: stopHold,
        onClick: (e: MouseEvent) => {
            if (e.detail === 0) step(key, delta);
        },
        onContextMenu: (e: MouseEvent) => e.preventDefault(),
    });

    const handleSave = async () => {
        try {
            setSaveError(null);
            await save(positions.map(p => p.id));
            notify.success('התקן השבועי נשמר');
        } catch (error) {
            logError('Failed to save demand template:', error);
            setSaveError(toAppError(error).message);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (loadError) {
        return (
            <InlineAlert variant="error" title="טעינת התקן השבועי נכשלה" action={{ label: 'נסה שוב', onClick: reload }}>
                {loadError.message}
            </InlineAlert>
        );
    }

    if (shifts.length === 0 || positions.length === 0) {
        return (
            <InlineAlert variant="info" title="אין עדיין מה להגדיר">
                {shifts.length === 0 ? 'לא הוגדרו משמרות לאתר זה.' : 'הוסף תפקיד אחד לפחות בלשונית "תפקידים".'}
            </InlineAlert>
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-sm text-slate-500">
                כמה עובדים נדרשים בכל משמרת, לפי תפקיד ויום בשבוע. התקן חל על כל השבועות; שינוי לתאריך מסוים נעשה בלוח הסידור.
            </p>

            <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
                <table className="w-full border-collapse min-w-max text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-slate-700">
                            <th className="p-2 border-b border-r text-right w-28">משמרת</th>
                            <th className="p-2 border-b border-r text-right w-28">תפקיד</th>
                            {DAY_NAMES.map(day => (
                                <th key={day} className="p-2 border-b border-r text-center w-24">{day}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shifts.map((shift, shiftIndex) => positions.map((position, positionIndex) => (
                            <tr
                                key={`${shift.id}-${position.id}`}
                                className={positionIndex === 0 && shiftIndex > 0 ? 'border-t-4 border-t-slate-300' : ''}
                            >
                                {positionIndex === 0 && (
                                    <td rowSpan={positions.length} className="p-2 border-b border-r align-top">
                                        <div className="font-medium text-slate-800">{shift.name}</div>
                                        <div className="text-xs text-slate-500" dir="ltr" style={{ display: 'inline-block' }}>
                                            {shift.start_time} - {shift.end_time}
                                        </div>
                                    </td>
                                )}
                                <td className="p-2 border-b border-r">
                                    <PositionBadge position={position} />
                                </td>
                                {DAY_NAMES.map((day, dayOfWeek) => {
                                    const key = templateKey(shift.id, position.id, dayOfWeek);
                                    const value = getValue(key);
                                    return (
                                        <td key={day} className="p-1 border-b border-r">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    type="button"
                                                    disabled={isSaving || value <= 0}
                                                    aria-label={`הפחתה: ${shift.name}, ${position.name}, ${day}`}
                                                    {...stepperHandlers(key, -1)}
                                                    className="w-6 h-6 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 touch-none select-none disabled:opacity-30"
                                                >
                                                    <Minus size={14} />
                                                </button>
                                                <span className={`w-6 text-center tabular-nums ${value > 0 ? 'font-semibold text-slate-800' : 'text-slate-300'}`}>
                                                    {value}
                                                </span>
                                                <button
                                                    type="button"
                                                    disabled={isSaving || value >= MAX_REQUIRED}
                                                    aria-label={`הוספה: ${shift.name}, ${position.name}, ${day}`}
                                                    {...stepperHandlers(key, 1)}
                                                    className="w-6 h-6 flex items-center justify-center rounded-full text-blue-600 hover:bg-blue-50 touch-none select-none disabled:opacity-30"
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        )))}
                    </tbody>
                </table>
            </div>

            {saveError && <InlineAlert variant="error" title="שמירת התקן נכשלה">{saveError}</InlineAlert>}

            <div className="flex justify-end gap-3">
                <button
                    type="button"
                    onClick={() => { discard(); setSaveError(null); }}
                    disabled={!isDirty || isSaving}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition disabled:opacity-50"
                >
                    <Undo2 size={16} />
                    ביטול שינויים
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!isDirty || isSaving}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition disabled:opacity-50"
                >
                    <Save size={16} />
                    {isSaving ? 'שומר...' : 'שמירה'}
                </button>
            </div>
        </div>
    );
}
