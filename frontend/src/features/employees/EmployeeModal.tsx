// src/features/employees/EmployeeModal.tsx
import React, { useState, useEffect } from 'react';
import { createEmployee, updateEmployee, updateEmployeeSettings } from '../../api/employees';
import type { Employee, EmployeeCreate, EmployeeUpdate, EmployeeSettingsUpdate } from '../../types';

interface EmployeeModalProps {
    isOpen: boolean;
    onClose: () => void;
    // If employee is null, the modal is in "Create" mode. If provided, it's in "Edit" mode.
    employee: Employee | null;
    locationId: number;
    // Callback to trigger a data refresh in the parent component after a successful save
    onSuccess: () => void; 
}

export default function EmployeeModal({ isOpen, onClose, employee, locationId, onSuccess }: EmployeeModalProps) {
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // --- Form Fields ---
    const [firstName, setFirstName] = useState<string>('');
    const [lastName, setLastName] = useState<string>('');
    const [email, setEmail] = useState<string>('');
    const [password, setPassword] = useState<string>(''); // Used only during creation
    const [notes, setNotes] = useState<string>('');
    const [newColor, setNewColor] = useState<string>('3B82F6');
    const [isActive, setIsActive] = useState<boolean>(true);

    // External Integrations Fields
    const [yalamId, setYalamId] = useState<string>('');
    const [mishmarotId, setMishmarotId] = useState<string>('');
    const [shiftorgId, setShiftorgId] = useState<string>('');

    // Settings Fields
    const [minShifts, setMinShifts] = useState<number>(0);
    const [maxShifts, setMaxShifts] = useState<number>(6);
    const [maxNights, setMaxNights] = useState<number>(2);
    const [minNights, setMinNights] = useState<number>(0);
    const [maxMornings, setMaxMornings] = useState<number>(6);
    const [minMornings, setMinMornings] = useState<number>(0);
    const [maxEvenings, setMaxEvenings] = useState<number>(6);
    const [minEvenings, setMinEvenings] = useState<number>(0);

    // Populate the form whenever the modal opens or the selected employee changes
    useEffect(() => {
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
            
            if (employee.settings) {
                setMinShifts(employee.settings.min_shifts_per_week);
                setMaxShifts(employee.settings.max_shifts_per_week);
                setMaxNights(employee.settings.max_nights ?? 2);
                setMinNights(employee.settings.min_nights ?? 0);
                setMaxMornings(employee.settings.max_mornings ?? 6);
                setMinMornings(employee.settings.min_mornings ?? 0);
                setMaxEvenings(employee.settings.max_evenings ?? 6);
                setMinEvenings(employee.settings.min_evenings ?? 0);
            }
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
            setMinShifts(0); setMaxShifts(6);
            setMaxNights(2); setMinNights(0);
            setMaxMornings(6); setMinMornings(0);
            setMaxEvenings(6); setMinEvenings(0);
        }
    }, [employee, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Basic validation for the new separated user fields
        if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
        
        // Enforce password input ONLY when creating a new employee
        if (!employee && !password) {
             alert("Password is required for new employees.");
             return;
        }

        try {
            setIsSubmitting(true);

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
                };
                
                await updateEmployee(employee.id, updatePayload);
                
                // Settings payload
                const settingsPayload: EmployeeSettingsUpdate = {
                    min_shifts_per_week: minShifts,
                    max_shifts_per_week: maxShifts,
                    max_nights: maxNights,
                    min_nights: minNights,
                    max_mornings: maxMornings,
                    min_mornings: minMornings,
                    max_evenings: maxEvenings,
                    min_evenings: minEvenings,
                };
                await updateEmployeeSettings(employee.id, settingsPayload);
                
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
                };
                
                await createEmployee(createPayload);
            }
            
            onSuccess(); // Triggers the parent to fetch the updated data
            onClose(); // Close the modal
            
        } catch (err) {
            console.error("Operation failed:", err);
            alert("Action failed. See console for details.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">
                    {employee ? 'Edit Employee & Settings' : 'Add New Employee'}
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* General Information */}
                    <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                        <h4 className="font-semibold text-gray-700 text-sm">General Info</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">First Name</label>
                                <input 
                                    type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
                                <input 
                                    type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)}
                                    className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                                <input 
                                    type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                    className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    {employee ? 'Password (Leave blank)' : 'Password'}
                                </label>
                                <input 
                                    type="password" 
                                    required={!employee} // Only required when creating a new employee
                                    disabled={!!employee} // Disabled in edit mode for this general form
                                    value={password} 
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={`w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 ${employee ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                />
                            </div>
                        </div>
                        <div>
                             <label className="block text-xs font-medium text-gray-700 mb-1">Notes (Optional)</label>
                             <textarea 
                                 value={notes} onChange={(e) => setNotes(e.target.value)}
                                 rows={2}
                                 className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                                 placeholder="e.g. Student, Prefers morning shifts..."
                             />
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
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
                                    <span className="text-sm font-medium text-gray-700">Is Active</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* External Integrations */}
                    <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                        <h4 className="font-semibold text-gray-700 text-sm">External Integrations (Optional)</h4>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Yalam ID</label>
                                <input 
                                    type="text" value={yalamId} onChange={(e) => setYalamId(e.target.value)} 
                                    className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500" 
                                    placeholder="e.g. 111031" 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Mishmarot ID</label>
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
                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg space-y-4">
                            <h4 className="font-semibold text-blue-800 text-sm">הגדרת משמרות עובד</h4>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="flex gap-4">
                                    <div className="flex-1"><label className="block text-xs font-medium text-gray-700 mb-1">מינ' משמרות</label><input type="number" min="0" value={minShifts} onChange={(e) => setMinShifts(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                    <div className="flex-1"><label className="block text-xs font-medium text-gray-700 mb-1">מקס משמרות</label><input type="number" min="0" value={maxShifts} onChange={(e) => setMaxShifts(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1"><label className="block text-xs font-medium text-gray-700 mb-1">מינ' בקרים</label><input type="number" min="0" value={minMornings} onChange={(e) => setMinMornings(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                    <div className="flex-1"><label className="block text-xs font-medium text-gray-700 mb-1">מקס בקרים</label><input type="number" min="0" value={maxMornings} onChange={(e) => setMaxMornings(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1"><label className="block text-xs font-medium text-gray-700 mb-1">מינ' ערבים</label><input type="number" min="0" value={minEvenings} onChange={(e) => setMinEvenings(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                    <div className="flex-1"><label className="block text-xs font-medium text-gray-700 mb-1">מקס ערבים</label><input type="number" min="0" value={maxEvenings} onChange={(e) => setMaxEvenings(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1"><label className="block text-xs font-medium text-gray-700 mb-1">מינ' לילות</label><input type="number" min="0" value={minNights} onChange={(e) => setMinNights(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                    <div className="flex-1"><label className="block text-xs font-medium text-gray-700 mb-1">מקס לילות</label><input type="number" min="0" value={maxNights} onChange={(e) => setMaxNights(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50">
                            {isSubmitting ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}