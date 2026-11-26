// src/features/admin/ShiftsTab.tsx
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';

import { shiftDefinitionsQuery } from '@/api/queries';
import { loadStatus } from '@/api/query';
import Button from '@/components/ui/Button';
import FormField from '@/components/ui/FormField';
import IconButton from '@/components/ui/IconButton';
import InlineAlert from '@/components/ui/InlineAlert';
import { Input, Select } from '@/components/ui/Input';
import { useConfirm } from '@/context/confirmContext';
import type { LocationData, ShiftDefinition } from '@/types';
import { useDeleteShift } from './hooks/useDeleteShift';
import { useShiftForm } from './hooks/useShiftForm';

const NO_SHIFTS: ShiftDefinition[] = [];

interface ShiftsTabProps {
    locations: LocationData[];
}

/**
 * Lists a location's shifts, and adds, edits and deletes them. Roles and demand are set per location in הגדרות אתר.
 */
export default function ShiftsTab({ locations }: ShiftsTabProps) {
    const confirm = useConfirm();

    const [locationId, setLocationId] = useState<number | null>(null);
    const shiftsQuery = useQuery(shiftDefinitionsQuery(locationId));
    const shifts = shiftsQuery.data ?? NO_SHIFTS;
    const { loadError } = loadStatus(shiftsQuery);

    const form = useShiftForm(locationId);
    const { remove, deletingId } = useDeleteShift(locationId);
    const { values, isEditMode } = form;

    const handleLocationChange = (value: string) => {
        setLocationId(value === '' ? null : Number(value));
        form.reset();
    };

    const handleDelete = async (shift: ShiftDefinition) => {
        const confirmed = await confirm({
            title: 'למחוק את המשמרת?',
            description: `המחיקה של המשמרת "${shift.name}" סופית: גם התקן השבועי שלה יימחק. לא ניתן לבטל פעולה זו.`,
            confirmText: 'מחיקה',
            tone: 'danger',
        });
        if (!confirmed) return;
        if (await remove(shift.id) && form.editingShiftId === shift.id) form.reset();
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        await form.submit();
    };

    if (locations.length === 0) {
        return <p className="text-sm text-slate-500">עדיין אין אתרים. הוסף אתר בלשונית מבנה ארגוני.</p>;
    }

    return (
        <div className="space-y-4">
            <FormField label="אתר" htmlFor="admin-shift-location">
                <Select
                    id="admin-shift-location"
                    value={locationId ?? ''}
                    onChange={(e) => handleLocationChange(e.target.value)}
                    className="max-w-sm"
                >
                    <option value="">בחר אתר</option>
                    {locations.map((location) => (
                        <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                </Select>
            </FormField>

            {locationId !== null && loadError && (
                <InlineAlert variant="error" title="טעינת המשמרות נכשלה" action={{ label: 'נסה שוב', onClick: () => void shiftsQuery.refetch() }}>
                    {loadError.message}
                </InlineAlert>
            )}

            {locationId !== null && !loadError && (
                <>
                    {shifts.length === 0 ? (
                        <p className="text-sm text-slate-500">לאתר זה עדיין אין משמרות.</p>
                    ) : (
                        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-w-xl">
                            {shifts.map((shift) => (
                                <li key={shift.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                    <span className="font-medium text-slate-800">{shift.name}</span>
                                    <div className="flex items-center gap-3">
                                        <span dir="ltr" className="text-slate-500">{shift.start_time} – {shift.end_time}</span>
                                        <Button variant="soft" size="sm" onClick={() => form.startEdit(shift)}>
                                            עריכה
                                        </Button>
                                        <IconButton
                                            tone="danger"
                                            label={`מחק את המשמרת ${shift.name}`}
                                            onClick={() => handleDelete(shift)}
                                            disabled={deletingId === shift.id}
                                        >
                                            <Trash2 size={18} />
                                        </IconButton>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    <form onSubmit={handleSubmit} className="bg-slate-50 p-4 rounded-lg space-y-3 max-w-xl">
                        <h4 className="font-semibold text-slate-700 text-sm">{isEditMode ? 'עריכת משמרת' : 'משמרת חדשה'}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <FormField label="שם" htmlFor="admin-shift-name">
                                <Input
                                    id="admin-shift-name"
                                    type="text"
                                    required
                                    value={values.name}
                                    onChange={(e) => form.setField('name', e.target.value)}
                                    placeholder="למשל: בוקר"
                                />
                            </FormField>
                            <FormField label="שעת התחלה" htmlFor="admin-shift-start">
                                <Input
                                    id="admin-shift-start"
                                    type="time"
                                    required
                                    value={values.startTime}
                                    onChange={(e) => form.setField('startTime', e.target.value)}
                                />
                            </FormField>
                            <FormField label="שעת סיום" htmlFor="admin-shift-end">
                                <Input
                                    id="admin-shift-end"
                                    type="time"
                                    required
                                    value={values.endTime}
                                    onChange={(e) => form.setField('endTime', e.target.value)}
                                />
                            </FormField>
                        </div>
                        {form.error && (
                            <InlineAlert variant="error" title={isEditMode ? 'שמירת המשמרת נכשלה' : 'הוספת המשמרת נכשלה'}>{form.error}</InlineAlert>
                        )}
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-slate-500">
                                {isEditMode
                                    ? 'שינוי השעות חל גם על שבועות קודמים.'
                                    : 'השלב הבא: הגדרת תפקידים ותקן שבועי באתר, במסך הגדרות אתר.'}
                            </p>
                            <div className="flex shrink-0 items-center gap-3">
                                {isEditMode && (
                                    <Button variant="secondary" onClick={form.reset}>
                                        ביטול
                                    </Button>
                                )}
                                <Button type="submit" variant="success" loading={form.isSaving}>
                                    {form.isSaving ? 'שומר...' : isEditMode ? 'שמור שינויים' : 'הוסף משמרת'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </>
            )}
        </div>
    );
}
