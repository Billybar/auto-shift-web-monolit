// src/features/employees/EmployeeModal.tsx
import type { FormEvent } from 'react';
import InlineAlert from '@/components/ui/InlineAlert';
import Button from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import Label from '@/components/ui/Label';
import type { Employee, Position } from '@/types';
import PositionPicker from '@/features/positions/PositionPicker';
import EmployeeSettingsFields from './EmployeeSettingsFields';
import { useEmployeeForm } from './hooks/useEmployeeForm';

interface EmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    // If employee is null, the modal is in "Create" mode. If provided, it's in "Edit" mode.
    employee: Employee | null;
    locationId: number;
    // Active roles of the location, offered in the role picker
    positions: Position[];
}

/** Adds or edits an employee. A save refreshes the employee lists through the query cache. */
export default function EmployeeModal({ isOpen, onClose, employee, locationId, positions }: EmployeeModalProps) {
    const { values, setField, errors, settings, submit, isSubmitting } = useEmployeeForm(employee, isOpen, positions, locationId);

    if (!isOpen) return null;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (await submit()) onClose();
    };

    return (
        // Esc and the backdrop act like Cancel, except while a save is in flight
        <Dialog open onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
            <DialogContent size="md" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>{employee ? 'עריכת עובד והגדרות' : 'יצירת עובד חדש'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* General Information */}
                    <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="employee-first-name">שם פרטי</Label>
                                <Input
                                    id="employee-first-name"
                                    type="text" required value={values.firstName} onChange={(e) => setField('firstName', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label htmlFor="employee-last-name">שם משפחה</Label>
                                <Input
                                    id="employee-last-name"
                                    type="text" required value={values.lastName} onChange={(e) => setField('lastName', e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="employee-email">מייל</Label>
                                <Input
                                    id="employee-email"
                                    type="email" required autoComplete="off" value={values.email}
                                    onChange={(e) => setField('email', e.target.value)}
                                    invalid={!!errors.email}
                                />
                                {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
                            </div>
                            <div>
                                <Label htmlFor="employee-password">
                                    {employee ? 'סיסמא (לא ניתן לערוך)' : 'סיסמא'}
                                </Label>
                                <Input
                                    id="employee-password"
                                    type="password"
                                    autoComplete="new-password"
                                    required={!employee} // Only required when creating a new employee
                                    disabled={!!employee} // Disabled in edit mode for this general form
                                    value={values.password}
                                    onChange={(e) => setField('password', e.target.value)}
                                    invalid={!!errors.password}
                                    className="disabled:cursor-not-allowed"
                                    placeholder="למשל: 1-8"
                                />
                                {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-1">
                                <Label htmlFor="employee-color">צבע</Label>
                                <input
                                    id="employee-color"
                                    type="color" value={`#${values.color.replace('#', '')}`} onChange={(e) => setField('color', e.target.value.substring(1))}
                                    className="h-8 w-full cursor-pointer border border-gray-300 rounded"
                                />
                            </div>
                            <div className="flex-1 flex items-center mt-5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox" checked={values.isActive} onChange={(e) => setField('isActive', e.target.checked)}
                                        className="w-4 h-4 text-blue-600"
                                    />
                                    <span className="text-sm font-medium text-gray-700">פעיל</span>
                                </label>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="employee-notes">הערות (אופציונלי)</Label>
                            <textarea
                                id="employee-notes"
                                value={values.notes} onChange={(e) => setField('notes', e.target.value)}
                                rows={2}
                                className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                                placeholder="למשל: מעדיף לילות על בקרים..."
                            />
                        </div>
                    </div>

                    {/* Roles */}
                    <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                        <h4 className="font-semibold text-gray-700 text-sm">תפקידים</h4>
                        <PositionPicker
                            positions={positions}
                            selectedIds={values.positionIds}
                            primaryId={values.primaryPositionId}
                            onChange={(ids, primary) => { setField('positionIds', ids); setField('primaryPositionId', primary); }}
                            disabled={isSubmitting}
                        />
                        {positions.length > 0 && (
                            <p className="text-xs text-gray-500">
                                {values.positionIds.length === 0
                                    ? 'ללא תפקיד העובד לא ישובץ אוטומטית'
                                    : 'הכוכב מסמן את התפקיד הראשי, שהשיבוץ האוטומטי מעדיף'}
                            </p>
                        )}
                    </div>

                    {/* External Integrations */}
                    <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                        <h4 className="font-semibold text-gray-700 text-sm">אינטגרציה חיצונית (אופציונלי)</h4>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <Label htmlFor="employee-yalam-id">ילמ ID</Label>
                                <Input
                                    id="employee-yalam-id"
                                    type="text" value={values.yalamId} onChange={(e) => setField('yalamId', e.target.value)}
                                    placeholder="למשל: 111031"
                                />
                            </div>
                            <div>
                                <Label htmlFor="employee-mishmarot-id">משמרות ID</Label>
                                <Input
                                    id="employee-mishmarot-id"
                                    type="text" value={values.mishmarotId} onChange={(e) => setField('mishmarotId', e.target.value)}
                                />
                            </div>
                            <div>
                                <Label htmlFor="employee-shiftorg-id">ShiftOrg ID</Label>
                                <Input
                                    id="employee-shiftorg-id"
                                    type="text" value={values.shiftorgId} onChange={(e) => setField('shiftorgId', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Optimization Settings (Only visible in Edit Mode) */}
                    {employee && (
                        <EmployeeSettingsFields values={settings.values} onFieldChange={settings.setField} error={settings.validationError} />
                    )}

                    {errors.form && <InlineAlert variant="error" title="שמירת העובד נכשלה">{errors.form}</InlineAlert>}

                    <DialogFooter>
                        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>ביטול</Button>
                        <Button type="submit" variant="success" loading={isSubmitting} disabled={!!employee && !!settings.validationError}>
                            {isSubmitting ? 'שומר...' : 'שמור'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}