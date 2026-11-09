// src/features/admin/ShiftsTab.tsx
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';

import { logError, toAppError } from '../../api/errors';
import type { AppError } from '../../api/errors';
import {
    createShiftDefinition,
    deleteShiftDefinition,
    getShiftDefinitions,
    updateShiftDefinition,
} from '../../api/shiftDefinitions';
import InlineAlert from '../../components/ui/InlineAlert';
import { useConfirm } from '../../context/confirmContext';
import { notify } from '../../lib/notify';
import type { LocationData, ShiftDefinition } from '../../types';

interface ShiftsTabProps {
    locations: LocationData[];
}

/**
 * Lists a location's shifts, and adds, edits and deletes them. Roles and demand are set per location in הגדרות אתר.
 */
export default function ShiftsTab({ locations }: ShiftsTabProps) {
    const confirm = useConfirm();

    const [locationId, setLocationId] = useState<number | ''>('');
    const [shifts, setShifts] = useState<ShiftDefinition[]>([]);
    const [loadError, setLoadError] = useState<AppError | null>(null);

    const [name, setName] = useState<string>('');
    const [startTime, setStartTime] = useState<string>('');
    const [endTime, setEndTime] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const isEditMode = editingShiftId !== null;

    const loadShifts = useCallback(async () => {
        if (locationId === '') return;
        try {
            setLoadError(null);
            setShifts(await getShiftDefinitions(locationId));
        } catch (error) {
            logError('Failed to load shifts:', error);
            setShifts([]);
            setLoadError(toAppError(error));
        }
    }, [locationId]);

    useEffect(() => {
        loadShifts();
    }, [loadShifts]);

    const resetForm = () => {
        setEditingShiftId(null);
        setName('');
        setStartTime('');
        setEndTime('');
        setFormError(null);
    };

    const handleLocationChange = (value: string) => {
        setLocationId(value === '' ? '' : Number(value));
        setShifts([]);
        setLoadError(null);
        resetForm();
    };

    const handleStartEdit = (shift: ShiftDefinition) => {
        setEditingShiftId(shift.id);
        setName(shift.name);
        setStartTime(shift.start_time);
        setEndTime(shift.end_time);
        setFormError(null);
    };

    const handleDelete = async (shift: ShiftDefinition) => {
        const confirmed = await confirm({
            title: 'למחוק את המשמרת?',
            description: `המחיקה של המשמרת "${shift.name}" סופית: גם התקן השבועי שלה יימחק. לא ניתן לבטל פעולה זו.`,
            confirmText: 'מחיקה',
            tone: 'danger',
        });
        if (!confirmed) return;

        try {
            setDeletingId(shift.id);
            await deleteShiftDefinition(shift.id);
            notify.success('המשמרת נמחקה');
            if (editingShiftId === shift.id) resetForm();
            await loadShifts();
        } catch (err) {
            notify.error(err, 'מחיקת המשמרת נכשלה');
        } finally {
            setDeletingId(null);
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmedName = name.trim();
        if (locationId === '' || !trimmedName || !startTime || !endTime) return;

        try {
            setIsSubmitting(true);
            setFormError(null);
            const fields = { name: trimmedName, start_time: startTime, end_time: endTime };
            if (editingShiftId !== null) {
                await updateShiftDefinition(editingShiftId, fields);
                notify.success('המשמרת עודכנה');
            } else {
                await createShiftDefinition({ ...fields, location_id: locationId });
                notify.success('המשמרת נוספה');
            }
            resetForm();
            await loadShifts();
        } catch (error) {
            logError('Failed to save shift:', error);
            setFormError(toAppError(error).message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (locations.length === 0) {
        return <p className="text-sm text-slate-500">עדיין אין אתרים. הוסף אתר בלשונית מבנה ארגוני.</p>;
    }

    return (
        <div className="space-y-4">
            <div>
                <label htmlFor="admin-shift-location" className="block text-xs font-medium text-gray-700 mb-1">אתר</label>
                <select
                    id="admin-shift-location"
                    value={locationId}
                    onChange={(e) => handleLocationChange(e.target.value)}
                    className="w-full max-w-sm border border-gray-300 rounded p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">בחר אתר</option>
                    {locations.map((location) => (
                        <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                </select>
            </div>

            {locationId !== '' && loadError && (
                <InlineAlert variant="error" title="טעינת המשמרות נכשלה" action={{ label: 'נסה שוב', onClick: loadShifts }}>
                    {loadError.message}
                </InlineAlert>
            )}

            {locationId !== '' && !loadError && (
                <>
                    {shifts.length === 0 ? (
                        <p className="text-sm text-slate-500">לאתר זה עדיין אין משמרות.</p>
                    ) : (
                        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg max-w-xl">
                            {shifts.map((shift) => (
                                <li key={shift.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                    <span className="font-medium text-slate-800">{shift.name}</span>
                                    <div className="flex items-center gap-3">
                                        <span dir="ltr" className="text-slate-500">{shift.start_time} – {shift.end_time}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleStartEdit(shift)}
                                            className="text-blue-600 hover:text-blue-800 font-medium px-3 py-1 bg-blue-50 hover:bg-blue-100 rounded transition"
                                        >
                                            עריכה
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(shift)}
                                            disabled={deletingId === shift.id}
                                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="מחק משמרת"
                                            aria-label={`מחק את המשמרת ${shift.name}`}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded-lg space-y-3 max-w-xl">
                        <h4 className="font-semibold text-gray-700 text-sm">{isEditMode ? 'עריכת משמרת' : 'משמרת חדשה'}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label htmlFor="admin-shift-name" className="block text-xs font-medium text-gray-700 mb-1">שם</label>
                                <input
                                    id="admin-shift-name"
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="למשל: בוקר"
                                    className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label htmlFor="admin-shift-start" className="block text-xs font-medium text-gray-700 mb-1">שעת התחלה</label>
                                <input
                                    id="admin-shift-start"
                                    type="time"
                                    required
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                    className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label htmlFor="admin-shift-end" className="block text-xs font-medium text-gray-700 mb-1">שעת סיום</label>
                                <input
                                    id="admin-shift-end"
                                    type="time"
                                    required
                                    value={endTime}
                                    onChange={(e) => setEndTime(e.target.value)}
                                    className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                        {formError && (
                            <InlineAlert variant="error" title={isEditMode ? 'שמירת המשמרת נכשלה' : 'הוספת המשמרת נכשלה'}>{formError}</InlineAlert>
                        )}
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-gray-500">
                                {isEditMode
                                    ? 'שינוי השעות חל גם על שבועות קודמים.'
                                    : 'השלב הבא: הגדרת תפקידים ותקן שבועי באתר, במסך הגדרות אתר.'}
                            </p>
                            <div className="flex shrink-0 items-center gap-3">
                                {isEditMode && (
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition"
                                    >
                                        ביטול
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
                                >
                                    {isSubmitting ? 'שומר...' : isEditMode ? 'שמור שינויים' : 'הוסף משמרת'}
                                </button>
                            </div>
                        </div>
                    </form>
                </>
            )}
        </div>
    );
}
