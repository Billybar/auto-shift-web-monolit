// src/features/constraints/components/WeeklyConstraintsBoard.tsx
import React from 'react';
import { useWeeklyConstraints } from './hooks/useWeeklyConstraints';
import { Save, XCircle, CalendarDays, AlertCircle } from 'lucide-react';
import { useShiftDefinitions } from './hooks/useShiftDefinitions';
import { useAppLocation } from '../../context/LocationContext';

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

    // Get the selected location ID from the global context
    const { selectedLocationId } = useAppLocation();

    // Check if a valid location is selected (must be a number)
    const hasValidLocation = typeof selectedLocationId === 'number';

    // Fetch dynamic shifts safely by providing a numeric fallback (0) 
    // to satisfy TypeScript when no location is selected.
    const { shifts, isLoadingShifts, shiftsError } = useShiftDefinitions(
        hasValidLocation ? selectedLocationId : 0
    );

    const {
        constraintsList,
        syncStartDate,
        isLoading: isLoadingConstraints,
        isSubmitting,
        weekDays,
        setSyncStartDate,
        toggleConstraint,
        saveConstraints,
        note,
        setNote
    } = useWeeklyConstraints({ employeeId, isManager });

    // Combine loading states so the UI blocks while either constraints or shifts are fetching
    const isOverlayLoading = isLoadingConstraints || isLoadingShifts;

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
        <div className="flex flex-col w-full bg-white rounded-xl" dir="rtl">
            {/* Header Section */}
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <CalendarDays className="text-blue-600" />
                       אילוצים עבור:  {employeeName}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {isManager 
                            ?'לחץ על תא: פנוי -> לא יכול -> חייב' 
                            : 'לחץ על תא כדי לשנות: פנוי ➔ לא יכול'}
                    </p>
                </div>
                
                {/* Week Selection */}
                <div className="flex items-end gap-3 bg-gray-50 p-2 rounded-lg border border-gray-200">
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

            {/* Error banner for shift definitions */}
            {shiftsError && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-2">
                    <AlertCircle size={18} />
                    <span>{shiftsError}</span>
                </div>
            )}

            {/* Grid Section - natural height so rows never collapse; scrolls horizontally on narrow screens */}
            <div className="overflow-x-auto border border-gray-300 rounded-xl mb-4 shadow-sm relative">
                {isOverlayLoading && (
                    <div className="absolute inset-0 bg-white/70 flex justify-center items-center z-10 backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                    </div>
                )}
                
                <table className="w-full text-center table-fixed border-collapse min-w-[700px]">
                    <thead className="bg-slate-800 text-white">
                        <tr>
                            <th className="w-24 p-3 border border-slate-700 font-semibold">משמרת</th>
                            {weekDays.map((date) => {
                                const dayName = new Date(date).toLocaleDateString('he-IL', { weekday: 'short' });
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
                        {shifts.length === 0 && !isLoadingShifts ? (
                            <tr>
                                <td colSpan={weekDays.length + 1} className="p-8 text-center text-gray-500">
                                    לא הוגדרו משמרות לסניף זה.
                                </td>
                            </tr>
                        ) : (
                            shifts.map((shift) => (
                                <tr key={shift.id}>
                                    <td className="p-2 bg-slate-100 font-bold text-slate-700 border border-gray-300">
                                        <div>{shift.name}</div>
                                        <div className="text-xs text-slate-500 font-normal mt-0.5">
                                            {shift.start_time} - {shift.end_time}
                                        </div>
                                    </td>
                                    {weekDays.map((date) => {
                                        const cellData = getCellDisplay(date, shift.id);
                                        return (
                                            <td key={`${date}-${shift.id}`} className="border border-gray-300 p-1 bg-gray-50">
                                                <button 
                                                    onClick={() => toggleConstraint(date, shift.id)}
                                                    disabled={isOverlayLoading}
                                                    className={`w-full h-12 rounded flex items-center justify-center transition border border-transparent select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${cellData.classes}`}
                                                >
                                                    {cellData.label}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            
            {/* Weekly Note Textarea Section */}
            <div className="mb-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    הערות לשבוע זה:
                </label>
                <textarea
                    rows={2}
                    value={note || ''}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={isOverlayLoading || isSubmitting}
                    className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y min-h-[56px]"
                />
            </div>

            {/* Bottom Actions Section - sticks to the bottom of the nearest scroller (page main / modal body) */}
            <div className="sticky bottom-0 z-20 bg-white flex justify-end gap-3 pt-3 pb-1 border-t border-gray-200">
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
                    // Disable save if submitting, loading, no shifts, or no valid location
                    disabled={isSubmitting || isOverlayLoading || shifts.length === 0 || !hasValidLocation} 
                    className="flex items-center gap-2 px-5 py-2 font-medium text-white transition rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                    >
                    <Save size={18} />
                    {isSubmitting ? 'שומר...' : 'שמור אילוצים'}
                </button>
            </div>
        </div>
    );
}