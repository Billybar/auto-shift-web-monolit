// src/features/employees/EmployeeModal.tsx
import type { FormEvent } from 'react';
import InlineAlert from '@/components/ui/InlineAlert';
import Button from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { fieldErrorId } from '@/components/ui/fieldErrorId';
import FormField from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
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
                            <FormField label="שם פרטי" htmlFor="employee-first-name">
                                <Input
                                    id="employee-first-name"
                                    type="text" required value={values.firstName} onChange={(e) => setField('firstName', e.target.value)}
                                />
                            </FormField>
                            <FormField label="שם משפחה" htmlFor="employee-last-name">
                                <Input
                                    id="employee-last-name"
                                    type="text" required value={values.lastName} onChange={(e) => setField('lastName', e.target.value)}
                                />
                            </FormField>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="מייל" htmlFor="employee-email" error={errors.email}>
                                <Input
                                    id="employee-email"
                                    type="email" required autoComplete="off" value={values.email}
                                    onChange={(e) => setField('email', e.target.value)}
                                    invalid={!!errors.email}
                                    aria-describedby={errors.email ? fieldErrorId('employee-email') : undefined}
                                />
                            </FormField>
                            <FormField
                                label={employee ? 'סיסמא (לא ניתן לערוך)' : 'סיסמא'}
                                htmlFor="employee-password"
                                error={errors.password}
                            >
                                <Input
                                    id="employee-password"
                                    type="password"
                                    autoComplete="new-password"
                                    required={!employee} // Only required when creating a new employee
                                    disabled={!!employee} // Disabled in edit mode for this general form
                                    value={values.password}
                                    onChange={(e) => setField('password', e.target.value)}
                                    invalid={!!errors.password}
                                    aria-describedby={errors.password ? fieldErrorId('employee-password') : undefined}
                                    className="disabled:cursor-not-allowed"
                                    placeholder="למשל: 1-8"
                                />
                            </FormField>
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
                        <FormField label="הערות (אופציונלי)" htmlFor="employee-notes">
                            <Textarea
                                id="employee-notes"
                                value={values.notes} onChange={(e) => setField('notes', e.target.value)}
                                rows={2}
                                placeholder="למשל: מעדיף לילות על בקרים..."
                            />
                        </FormField>
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
                            <FormField label="ילמ ID" htmlFor="employee-yalam-id">
                                <Input
                                    id="employee-yalam-id"
                                    type="text" value={values.yalamId} onChange={(e) => setField('yalamId', e.target.value)}
                                    placeholder="למשל: 111031"
                                />
                            </FormField>
                            <FormField label="משמרות ID" htmlFor="employee-mishmarot-id">
                                <Input
                                    id="employee-mishmarot-id"
                                    type="text" value={values.mishmarotId} onChange={(e) => setField('mishmarotId', e.target.value)}
                                />
                            </FormField>
                            <FormField label="ShiftOrg ID" htmlFor="employee-shiftorg-id">
                                <Input
                                    id="employee-shiftorg-id"
                                    type="text" value={values.shiftorgId} onChange={(e) => setField('shiftorgId', e.target.value)}
                                />
                            </FormField>
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