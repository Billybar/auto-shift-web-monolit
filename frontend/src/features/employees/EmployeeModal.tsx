// src/features/employees/EmployeeModal.tsx
import React, { useState, useEffect } from 'react';
import { createEmployee, updateEmployee, updateEmployeeSettings } from '../../api/employees';
import type { Employee, EmployeeCreate, EmployeeSettingsUpdate } from '../../types';

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
    const [newName, setNewName] = useState<string>('');
    const [newColor, setNewColor] = useState<string>('3B82F6');
    const [isActive, setIsActive] = useState<boolean>(true);

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
            setNewName(employee.name);
            setNewColor(employee.color);
            setIsActive(employee.is_active);
            
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
            setNewName('');
            setNewColor('3B82F6');
            setIsActive(true);
            setMinShifts(0); setMaxShifts(6);
            setMaxNights(2); setMinNights(0);
            setMaxMornings(6); setMinMornings(0);
            setMaxEvenings(6); setMinEvenings(0);
        }
    }, [employee, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        try {
            setIsSubmitting(true);
            
            const employeePayload: EmployeeCreate = {
                name: newName,
                location_id: locationId,
                color: newColor.replace('#', ''),
                is_active: isActive
            };

            if (employee) {
                // --- EDIT MODE ---
                await updateEmployee(employee.id, employeePayload);
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
                await createEmployee(employeePayload);
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
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                            <input 
                                type="text" required value={newName} onChange={(e) => setNewName(e.target.value)}
                                className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
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

                    {/* Optimization Settings (Only visible in Edit Mode) */}
                    {employee && (
                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg space-y-4">
                            <h4 className="font-semibold text-blue-800 text-sm">Optimization Settings</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Min Shifts / Week</label><input type="number" min="0" value={minShifts} onChange={(e) => setMinShifts(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Max Shifts / Week</label><input type="number" min="0" value={maxShifts} onChange={(e) => setMaxShifts(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                </div>
                                <div className="space-y-2">
                                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Min Mornings</label><input type="number" min="0" value={minMornings} onChange={(e) => setMinMornings(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Max Mornings</label><input type="number" min="0" value={maxMornings} onChange={(e) => setMaxMornings(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                </div>
                                <div className="space-y-2">
                                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Min Evenings</label><input type="number" min="0" value={minEvenings} onChange={(e) => setMinEvenings(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Max Evenings</label><input type="number" min="0" value={maxEvenings} onChange={(e) => setMaxEvenings(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                </div>
                                <div className="space-y-2">
                                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Min Nights</label><input type="number" min="0" value={minNights} onChange={(e) => setMinNights(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
                                    <div><label className="block text-xs font-medium text-gray-700 mb-1">Max Nights</label><input type="number" min="0" value={maxNights} onChange={(e) => setMaxNights(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" /></div>
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