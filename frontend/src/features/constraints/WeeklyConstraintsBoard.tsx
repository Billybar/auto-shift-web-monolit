// src/features/constraints/components/WeeklyConstraintsBoard.tsx
import React from 'react';
import { useWeeklyConstraints } from './hooks/useWeeklyConstraints';
import { Save, XCircle, CalendarDays } from 'lucide-react';

// Hardcoded for now as agreed. Can be moved to a context or fetched later.
const SHIFT_TYPES = [
    { id: 7, name: 'בוקר' },
    { id: 8, name: 'ערב' },
    { id: 9, name: 'לילה' }
];

export interface WeeklyConstraintsBoardProps {
    employeeId: number;
    employeeName: string;
    isManager: boolean;
    onCancel?: () => void;
    onSaveSuccess?: () => void;
}

export default function WeeklyConstraintsBoard({ 
    employeeId, 
    employeeName, 
    isManager, 
    onCancel, 
    onSaveSuccess 
}: WeeklyConstraintsBoardProps) {
    
    // Consume the custom hook we built in Step 1
    const {
        constraintsList,
        syncStartDate,
        isLoading,
        isSubmitting,
        weekDays,
        setSyncStartDate,
        toggleConstraint,
        saveConstraints
    } = useWeeklyConstraints({ employeeId, isManager });

    // Helper to determine the visual styling and text label for a specific cell
    const getCellDisplay = (date: string, shiftId: number) => {
        const constraint = constraintsList.find(c => c.date === date && c.shift_id === shiftId);
        
        if (!constraint) return { label: 'פנוי', classes: 'bg-white text-gray-400 hover:bg-gray-100' };
        
        if (constraint.constraint_type === 'cannot_work') {
            return { label: 'X לא יכול', classes: 'bg-red-100 text-red-700 border-red-300 font-bold' };
        }
        
        if (constraint.constraint_type === 'must_work') {
            return { label: 'V חייב', classes: 'bg-green-100 text-green-700 border-green-300 font-bold' };
        }

        return { label: 'פנוי', classes: 'bg-white text-gray-400 hover:bg-gray-100' };
    };

    const handleSave = async () => {
        const result = await saveConstraints();
        if (result?.success) {
            alert('האילוצים נשמרו בהצלחה!');
            if (onSaveSuccess) onSaveSuccess();
        } else {
            alert(`שגיאה בשמירה: ${result?.error}`);
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-white rounded-xl" dir="rtl">
            {/* Header Section */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <CalendarDays className="text-blue-600" />
                        הגשת אילוצים: {employeeName}
                        {isManager && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full border border-purple-200 font-medium ml-2">
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
                
                {/* Week Selection */}
                <div className="flex items-end gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">תאריך תחילת שבוע</label>
                        <input 
                            type="date" 
                            value={syncStartDate} 
                            onChange={(e) => setSyncStartDate(e.target.value)} 
                            className="border border-gray-300 rounded p-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                    </div>
                </div>
            </div>

            {/* Grid Section */}
            <div className="flex-1 overflow-auto border border-gray-300 rounded-xl mb-6 shadow-sm relative">
                {isLoading && (
                    <div className="absolute inset-0 bg-white/70 flex justify-center items-center z-10 backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                    </div>
                )}
                
                <table className="w-full text-center table-fixed border-collapse min-w-[700px]">
                    <thead className="bg-slate-800 text-white sticky top-0 z-0">
                        <tr>
                            <th className="w-24 p-3 border border-slate-700 font-semibold">משמרת</th>
                            {weekDays.map((date) => {
                                const dayName = new Date(date).toLocaleDateString('he-IL', { weekday: 'long' });
                                return (
                                    <th key={date} className="p-2 border border-slate-700 font-medium">
                                        <div className="text-sm">{dayName}</div>
                                        <div className="text-xs text-slate-300 font-light">{date.split('-').reverse().join('/')}</div>
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
                                {weekDays.map((date) => {
                                    const cellData = getCellDisplay(date, shift.id);
                                    return (
                                        <td key={`${date}-${shift.id}`} className="border border-gray-300 p-1 bg-gray-50">
                                            <button 
                                                onClick={() => toggleConstraint(date, shift.id)}
                                                disabled={isLoading}
                                                className={`w-full h-16 rounded flex items-center justify-center transition border border-transparent select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${cellData.classes}`}
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

            {/* Bottom Actions Section */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-auto">
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
                    disabled={isSubmitting || isLoading} 
                    className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 font-medium flex items-center gap-2"
                >
                    <Save size={18} />
                    {isSubmitting ? 'שומר...' : 'שמור אילוצים'}
                </button>
            </div>
        </div>
    );
}