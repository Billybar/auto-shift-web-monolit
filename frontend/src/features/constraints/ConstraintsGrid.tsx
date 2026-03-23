// src/features/constraints/ConstraintsGrid.tsx
import React, { useEffect, useState } from 'react';
import { getEmployeeConstraints, syncEmployeeConstraints } from '../../api/constraints'; // ודא ששם הקובץ תקין
import type { WeeklyConstraintCreate } from '../../types';

interface ConstraintsGridProps {
    employeeId: number;
    employeeName: string;
    isManager: boolean;
    initialStartDate: string;
    onClose?: () => void; // Optional: used when inside a modal to close it after save
}

const SHIFT_TYPES = [
    { id: 7, name: 'בוקר' },
    { id: 8, name: 'ערב' },
    { id: 9, name: 'לילה' }
];

export default function ConstraintsGrid({ 
    employeeId, 
    employeeName, 
    isManager, 
    initialStartDate,
    onClose 
}: ConstraintsGridProps) {
    
    // --- State ---
    const [constraintsList, setConstraintsList] = useState<WeeklyConstraintCreate[]>([]);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    
    // Date management inside the component
    const [syncStartDate, setSyncStartDate] = useState<string>(initialStartDate);
    const [syncEndDate, setSyncEndDate] = useState<string>('');

    // Update end date whenever start date changes
    useEffect(() => {
        const start = new Date(syncStartDate);
        start.setDate(start.getDate() + 6);
        setSyncEndDate(start.toISOString().split('T')[0]);
    }, [syncStartDate]);

    // Auto-fetch constraints whenever dates or employee change
    useEffect(() => {
        if (!syncEndDate) return; // Wait until end date is calculated

        const loadConstraints = async () => {
            setConstraintsList([]); // Clear table visually while loading
            try {
                const existing = await getEmployeeConstraints(employeeId, syncStartDate, syncEndDate);
                const mapped = existing.map(c => ({
                    employee_id: c.employee_id,
                    shift_id: c.shift_id,
                    date: c.date,
                    constraint_type: c.constraint_type
                }));
                setConstraintsList(mapped);
            } catch (err) {
                console.error("Failed to fetch constraints automatically", err);
            }
        };

        loadConstraints();
    }, [employeeId, syncStartDate, syncEndDate]);

    // --- Helpers ---
    const getWeekDays = () => {
        if (!syncStartDate) return [];
        const days = [];
        let currentDate = new Date(syncStartDate);
        for (let i = 0; i < 7; i++) {
            days.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return days;
    };

    const handleToggleCell = (date: string, shiftId: number) => {
        const existingIndex = constraintsList.findIndex(c => c.date === date && c.shift_id === shiftId);
        
        if (existingIndex >= 0) {
            const existing = constraintsList[existingIndex];
            const updated = [...constraintsList];
            
            if (existing.constraint_type === 'cannot_work' || existing.constraint_type === 'cannot_work' as any) {
                if (isManager) {
                    updated[existingIndex].constraint_type = 'must_work';
                    setConstraintsList(updated);
                } else {
                    updated.splice(existingIndex, 1);
                    setConstraintsList(updated);
                }
            } else {
                updated.splice(existingIndex, 1);
                setConstraintsList(updated);
            }
        } else {
            const newConstraint: WeeklyConstraintCreate = {
                employee_id: employeeId,
                shift_id: shiftId,
                date: date,
                constraint_type: 'cannot_work'
            };
            setConstraintsList([...constraintsList, newConstraint]);
        }
    };

    const getCellDisplay = (date: string, shiftId: number) => {
        const constraint = constraintsList.find(c => c.date === date && c.shift_id === shiftId);
        if (!constraint) return { label: 'פנוי', classes: 'bg-white text-gray-400 hover:bg-gray-100' };
        if (constraint.constraint_type === 'cannot_work') {
            return { label: 'X לא יכול', classes: 'bg-red-100 text-red-700 border-red-300 font-bold' };
        }
        return { label: 'V חייב', classes: 'bg-green-100 text-green-700 border-green-300 font-bold' };
    };

    const handleSyncConstraints = async () => {
        try {
            setIsSubmitting(true);
            await syncEmployeeConstraints(employeeId, syncStartDate, syncEndDate, constraintsList);
            alert('האילוצים נשמרו בהצלחה!');
            if (onClose) onClose();
        } catch (err: any) {
            console.error("Failed to sync constraints", err);
            const backendMsg = err.response?.data?.detail || "תקלת תקשורת מול השרת.";
            alert(`שגיאה בשמירה: ${backendMsg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div dir="rtl" className="w-full">
            {/* Header Area */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        הגשת אילוצים: {employeeName}
                        {isManager && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full border border-purple-200 font-medium">
                                מצב מנהל
                            </span>
                        )}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {isManager 
                            ? 'לחץ על תא כדי לשנות: פנוי ➔ לא יכול ➔ חייב' 
                            : 'לחץ על תא כדי לשנות: פנוי ➔ לא יכול'}
                    </p>
                </div>
                
                <div className="flex items-end gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">תאריך תחילת שבוע</label>
                        <input 
                            type="date" 
                            value={syncStartDate} 
                            onChange={(e) => setSyncStartDate(e.target.value)} 
                            className="border border-gray-300 rounded p-1.5 text-sm" 
                        />
                    </div>
                </div>
            </div>

            {/* Grid Area */}
            <div className="border border-gray-300 rounded-xl overflow-hidden mb-6 bg-white shadow-sm">
                <table className="w-full text-center table-fixed border-collapse">
                    <thead className="bg-slate-800 text-white">
                        <tr>
                            <th className="w-24 p-3 border border-slate-700 font-semibold">משמרת</th>
                            {getWeekDays().map((date) => {
                                const dayName = new Date(date).toLocaleDateString('he-IL', { weekday: 'long' });
                                return (
                                    <th key={date} className="p-2 border border-slate-700 font-medium">
                                        <div className="text-sm">{dayName}</div>
                                        <div className="text-xs text-slate-300">{date.split('-').reverse().join('/')}</div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {SHIFT_TYPES.map((shift) => (
                            <tr key={shift.id}>
                                <td className="p-3 bg-slate-100 font-bold text-slate-700 border border-gray-300">
                                    {shift.name}
                                </td>
                                {getWeekDays().map((date) => {
                                    const cellData = getCellDisplay(date, shift.id);
                                    return (
                                        <td key={`${date}-${shift.id}`} className="border border-gray-300 p-1 bg-gray-50">
                                            <button 
                                                onClick={() => handleToggleCell(date, shift.id)}
                                                className={`w-full h-16 rounded flex items-center justify-center transition border border-transparent select-none cursor-pointer ${cellData.classes}`}
                                            >
                                                {cellData.label}
                                            </button>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                {onClose && (
                    <button 
                        onClick={onClose} 
                        className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition font-medium"
                    >
                        ביטול
                    </button>
                )}
                <button 
                    onClick={handleSyncConstraints} 
                    disabled={isSubmitting} 
                    className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 font-medium flex items-center gap-2"
                >
                    {isSubmitting ? 'שומר...' : 'שמור אילוצים (Sync)'}
                </button>
            </div>
        </div>
    );
}