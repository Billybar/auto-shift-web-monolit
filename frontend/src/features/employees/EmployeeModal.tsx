// src/features/employees/EmployeeModal.tsx
import React, { useState, useEffect } from 'react';
import { createEmployee, updateEmployee, updateEmployeeSettings } from '../../api/employees';
import { logError, toAppError } from '../../api/errors';
import { notify } from '../../lib/notify';
import InlineAlert from '../../components/ui/InlineAlert';
import type { Employee, EmployeeCreate, EmployeeUpdate, Position } from '../../types';
import PositionPicker from '../positions/PositionPicker';
import EmployeeSettingsFields from './EmployeeSettingsFields';
import { useEmployeeSettingsForm } from './hooks/useEmployeeSettingsForm';

interface EmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    // If employee is null, the modal is in "Create" mode. If provided, it's in "Edit" mode.
    employee: Employee | null;
    locationId: number;
    // Active roles of the location, offered in the role picker
    positions: Position[];
    // Callback to trigger a data refresh in the parent component after a successful save
    onSuccess: () => void; 
}

export default function EmployeeModal({ isOpen, onClose, employee, locationId, positions, onSuccess }: EmployeeModalProps) {
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // --- Form Fields ---
    const [firstName, setFirstName] = useState<string>('');
    const [lastName, setLastName] = useState<string>('');
    const [email, setEmail] = useState<string>('');
    // Set when the server rejects the email as already registered (409)
    const [emailError, setEmailError] = useState<string | null>(null);
    const [password, setPassword] = useState<string>(''); // Used only during creation
    const [passwordError, setPasswordError] = useState<string | null>(null);
    // Why the last save failed, when it isn't about a single field (shown above the buttons)
    const [formError, setFormError] = useState<string | null>(null);
    const [notes, setNotes] = useState<string>('');
    const [newColor, setNewColor] = useState<string>('3B82F6');
    const [isActive, setIsActive] = useState<boolean>(true);

    // External Integrations Fields
    const [yalamId, setYalamId] = useState<string>('');
    const [mishmarotId, setMishmarotId] = useState<string>('');
    const [shiftorgId, setShiftorgId] = useState<string>('');

    // Roles (only active ones are edited here; archived links stay on the server)
    const [positionIds, setPositionIds] = useState<number[]>([]);
    const [primaryPositionId, setPrimaryPositionId] = useState<number | null>(null);

    // Settings Fields (shift limits, shared with the schedule page's EmployeeSettingsModal)
    const { values: settings, setField: setSettingsField, validationError: settingsError } = useEmployeeSettingsForm(employee, isOpen);

    // Populate the form whenever the modal opens or the selected employee changes
    useEffect(() => {
        setEmailError(null);
        setPasswordError(null);
        setFormError(null);
        if (employee) {
            // Populate from the nested user object
            setFirstName(employee.user?.first_name || '');
            setLastName(employee.user?.last_name || '');
            setEmail(employee.user?.email || '');
            setPassword(''); // Do not display existing passwords
            setNotes(employee.notes || '');

            setNewColor(employee.color);
            setIsActive(employee.is_active);

            setYalamId(employee.yalam_id || '');
            setMishmarotId(employee.mishmarot_id || '');
            setShiftorgId(employee.shiftorg_id || '');

            const activeIds = new Set(positions.map(p => p.id));
            setPositionIds(employee.position_ids.filter(id => activeIds.has(id)));
            setPrimaryPositionId(
                employee.primary_position_id !== null && activeIds.has(employee.primary_position_id)
                    ? employee.primary_position_id
                    : null
            );
        } else {
            // Reset for Create mode
            setFirstName('');
            setLastName('');
            setEmail('');
            setPassword('');
            setNotes('');

            setNewColor('3B82F6');
            setIsActive(true);
            setYalamId('');
            setMishmarotId('');
            setShiftorgId('');

            // A site with one role: the new employee holds it, as they would without roles
            const onlyPosition = positions.length === 1 ? positions[0].id : null;
            setPositionIds(onlyPosition !== null ? [onlyPosition] : []);
            setPrimaryPositionId(onlyPosition);
        }
    }, [employee, isOpen, positions]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Basic validation for the new separated user fields
        if (!firstName.trim() || !lastName.trim() || !email.trim()) return;

        // Block invalid shift limits before any request is sent, so the employee is never half-updated
        if (settingsError) return;

        // Enforce password input ONLY when creating a new employee
        if (!employee && !password) {
            setPasswordError('יש להזין סיסמא לעובד חדש');
            return;
        }

        try {
            setIsSubmitting(true);
            setFormError(null);

            if (employee) {
                // --- EDIT MODE ---
                const updatePayload: EmployeeUpdate = {
                    first_name: firstName,
                    last_name: lastName,
                    email: email,
                    notes: notes,
                    location_id: locationId,
                    color: newColor.replace('#', ''),
                    is_active: isActive,
                    yalam_id: yalamId.trim() !== '' ? yalamId.trim() : null,
                    mishmarot_id: mishmarotId.trim() !== '' ? mishmarotId.trim() : null,
                    shiftorg_id: shiftorgId.trim() !== '' ? shiftorgId.trim() : null,
                    position_ids: positionIds,
                    primary_position_id: primaryPositionId,
                };

                await updateEmployee(employee.id, updatePayload);
                
                // Settings payload
                await updateEmployeeSettings(employee.id, settings);
                
            } else {
                // --- CREATE MODE ---
                const createPayload: EmployeeCreate = {
                    first_name: firstName,
                    last_name: lastName,
                    email: email,
                    password: password, // Included only in creation
                    notes: notes,
                    location_id: locationId,
                    color: newColor.replace('#', ''),
                    is_active: isActive,
                    yalam_id: yalamId.trim() !== '' ? yalamId.trim() : null,
                    mishmarot_id: mishmarotId.trim() !== '' ? mishmarotId.trim() : null,
                    shiftorg_id: shiftorgId.trim() !== '' ? shiftorgId.trim() : null,
                    position_ids: positionIds,
                    primary_position_id: primaryPositionId,
                };

                await createEmployee(createPayload);
            }

            notify.success(employee ? 'פרטי העובד עודכנו' : 'העובד נוסף');
            onSuccess(); // Triggers the parent to fetch the updated data
            onClose(); // Close the modal

        } catch (err) {
            logError("Failed to save employee:", err);
            const appError = toAppError(err);
            // The only 409 without a code is the email check; any coded error has its own message
            if (appError.status === 409 && !appError.code) {
                setEmailError('כתובת המייל כבר קיימת במערכת');
            } else {
                setFormError(appError.message);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        // Clicking the backdrop acts like Cancel. Checked on mousedown so a text selection that
        // starts inside an input and is released outside the panel does not close the modal.
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">
                    {employee ? 'עריכת עובד והגדרות' : 'יצירת עובד חדש'}
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* General Information */}
                    <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">שם פרטי</label>
                                <input 
                                    type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">שם משפחה</label>
                                <input 
                                    type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)}
                                    className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">מייל</label>
                                <input 
                                    type="email" required autoComplete="off" value={email}
                                    onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                                    className={`w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 ${emailError ? 'border-red-500' : 'border-gray-300'}`}
                                />
                                {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    {employee ? 'סיסמא (לא ניתן לערוך)' : 'סיסמא'}
                                </label>
                                <input 
                                    type="password" 
                                    autoComplete="new-password"
                                    required={!employee} // Only required when creating a new employee
                                    disabled={!!employee} // Disabled in edit mode for this general form
                                    value={password}
                                    onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
                                    className={`w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 ${passwordError ? 'border-red-500' : 'border-gray-300'} ${employee ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                    placeholder="למשל: 1-8"
                                />
                                {passwordError && <p className="text-xs text-red-600 mt-1">{passwordError}</p>}
                            </div>
                        </div>
                        
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-700 mb-1">צבע</label>
                                <input 
                                    type="color" value={`#${newColor.replace('#', '')}`} onChange={(e) => setNewColor(e.target.value.substring(1))}
                                    className="h-8 w-full cursor-pointer border border-gray-300 rounded"
                                />
                            </div>
                            <div className="flex-1 flex items-center mt-5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
                                        className="w-4 h-4 text-blue-600"
                                    />
                                    <span className="text-sm font-medium text-gray-700">פעיל</span>
                                </label>
                            </div>
                        </div>
                        <div>
                             <label className="block text-xs font-medium text-gray-700 mb-1">הערות (אופציונלי)</label>
                             <textarea 
                                 value={notes} onChange={(e) => setNotes(e.target.value)}
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
                            selectedIds={positionIds}
                            primaryId={primaryPositionId}
                            onChange={(ids, primary) => { setPositionIds(ids); setPrimaryPositionId(primary); }}
                            disabled={isSubmitting}
                        />
                        {positions.length > 0 && (
                            <p className="text-xs text-gray-500">
                                {positionIds.length === 0
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
                                <label className="block text-xs font-medium text-gray-700 mb-1">ילמ ID</label>
                                <input 
                                    type="text" value={yalamId} onChange={(e) => setYalamId(e.target.value)} 
                                    className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500" 
                                    placeholder="למשל: 111031" 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">משמרות ID</label>
                                <input 
                                    type="text" value={mishmarotId} onChange={(e) => setMishmarotId(e.target.value)} 
                                    className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500" 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">ShiftOrg ID</label>
                                <input 
                                    type="text" value={shiftorgId} onChange={(e) => setShiftorgId(e.target.value)} 
                                    className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500" 
                                />
                            </div>
                        </div>
                    </div>
                    
                    {/* Optimization Settings (Only visible in Edit Mode) */}
                    {employee && (
                        <EmployeeSettingsFields values={settings} onFieldChange={setSettingsField} error={settingsError} />
                    )}

                    {formError && <InlineAlert variant="error" title="שמירת העובד נכשלה">{formError}</InlineAlert>}

                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition">ביטול</button>
                        <button type="submit" disabled={isSubmitting || !!settingsError} className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50">
                            {isSubmitting ? 'שומר...' : 'שמור'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}