// frontend/src/features/schedule/SchedulePage.tsx

import React, { useState, useEffect } from 'react';
import { getLocationById, getLocationWeights, updateLocationWeights } from '../../api/locations';
import { getShiftDefinitions, getShiftDemands } from '../../api/shiftDefinitions'; 
import type { LocationData, ShiftDefinition, ShiftDemand, LocationWeights } from '../../types';
import { Settings, Play, Save, X } from 'lucide-react';

const getNextSunday = (): Date => {
    const today = new Date();
    const daysUntilSunday = 7 - today.getDay();
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + daysUntilSunday);
    nextSunday.setHours(0, 0, 0, 0);
    return nextSunday;
};

const generateWeekDates = (startDate: Date): Date[] => {
    return Array.from({ length: 7 }).map((_, index) => {
        const date = new Date(startDate);
        date.setDate(date.getDate() + index);
        return date;
    });
};

export default function SchedulePage() {
    // --- Data States ---
    const [location, setLocation] = useState<LocationData | null>(null);
    const [shiftDefinitions, setShiftDefinitions] = useState<ShiftDefinition[]>([]);
    const [shiftDemandsMap, setShiftDemandsMap] = useState<Record<number, ShiftDemand[]>>({});
    
    // --- Date States ---
    const [weekStart] = useState<Date>(getNextSunday());
    const weekDates = generateWeekDates(weekStart);

    // --- UI States ---
    const [loading, setLoading] = useState<boolean>(true);
    
    // --- NEW: Modal & Weights States ---
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    
    // Initialize with safe defaults, will be overwritten by fetch
    const [weights, setWeights] = useState<LocationWeights>({
        target_shifts: 40,
        rest_gap: 40,
        consecutive_nights: 100,
        max_nights: 5,
        max_mornings: 6,
        max_evenings: 2,
        min_nights: 0,
        min_mornings: 0,
        min_evenings: 0,
    });

    const CURRENT_LOCATION_ID = 3; 

    const fetchBoardStructure = async () => {
        try {
            setLoading(true);
            
            // 1. Fetch location, shifts, AND weights concurrently
            const [locData, shiftsData, weightsData] = await Promise.all([
                getLocationById(CURRENT_LOCATION_ID),
                getShiftDefinitions(CURRENT_LOCATION_ID),
                getLocationWeights(CURRENT_LOCATION_ID) // <--- Fetching weights from backend
            ]);
            
            // 2. Fetch demands for all fetched shifts
            const demandsPromises = shiftsData.map(shift => getShiftDemands(shift.id));
            const demandsResults = await Promise.all(demandsPromises);
            
            const demandsMap: Record<number, ShiftDemand[]> = {};
            shiftsData.forEach((shift, index) => {
                demandsMap[shift.id] = demandsResults[index];
            });

            // 3. Update States
            setLocation(locData);
            setShiftDefinitions(shiftsData);
            setShiftDemandsMap(demandsMap);
            
            // Populate the form with real DB weights
            setWeights(weightsData);

        } catch (error) {
            console.error("Failed to fetch board structure:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBoardStructure();
    }, []);

    // --- NEW: Handle Form Submit ---
    const handleSaveWeights = async (e: React.FormEvent) => {
        e.preventDefault(); // Prevent page reload
        try {
            setIsSubmitting(true);
            // Send the updated weights to the backend
            const updatedWeights = await updateLocationWeights(CURRENT_LOCATION_ID, weights);
            setWeights(updatedWeights); // Sync state with backend response
            setIsSettingsOpen(false);   // Close the modal
            // Optional: Show success toast/alert here
        } catch (error) {
            console.error("Failed to update weights:", error);
            alert("Failed to save optimization settings.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col space-y-4 relative">
            {/* Header Actions */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-gray-800">Weekly Schedule Board</h2>
                    <p className="text-sm text-gray-500">
                        Location: {location?.name} | Week of: {weekStart.toLocaleDateString('en-US')}
                    </p>
                </div>
                
                <div className="flex space-x-3 space-x-reverse">
                    <button 
                        onClick={() => setIsSettingsOpen(true)}
                        className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition border border-slate-300"
                    >
                        <Settings size={18} />
                        Optimization Weights
                    </button>
                    <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition">
                        <Play size={18} />
                        Auto Assign
                    </button>
                    <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition">
                        <Save size={18} />
                        Publish
                    </button>
                </div>
            </div>

            {/* The Schedule Grid */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-grow overflow-hidden flex flex-col">
                <div className="overflow-x-auto h-full">
                    <table className="w-full text-left border-collapse min-w-max h-full">
                        <thead>
                            <tr>
                                <th className="p-3 border-b border-r bg-slate-50 font-semibold text-slate-700 w-40 sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb]">
                                    Shift / Day
                                </th>
                                {weekDates.map((date, idx) => (
                                    <th key={idx} className="p-3 border-b border-r bg-slate-50 text-center w-32">
                                        <div className="font-semibold text-slate-700">
                                            {date.toLocaleDateString('en-US', { weekday: 'short' })}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {shiftDefinitions.map((shift) => {
                                const demands = shiftDemandsMap[shift.id] || [];
                                const maxRequired = demands.length > 0 
                                    ? Math.max(...demands.map(d => d.required_employees)) 
                                    : 1; 
                                const slots = Array.from({ length: maxRequired });

                                return slots.map((_, slotIndex) => (
                                    <tr key={`${shift.id}-slot-${slotIndex}`} className="hover:bg-slate-50/50 transition">
                                        {slotIndex === 0 && (
                                            <td rowSpan={maxRequired} className="p-3 border-b border-r bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb] align-top">
                                                <div className="font-medium text-slate-800">{shift.name}</div>
                                                <div className="text-xs text-slate-500">{shift.start_time} - {shift.end_time}</div>
                                            </td>
                                        )}
                                        {weekDates.map((date, dayIdx) => {
                                            const dayOfWeek = date.getDay();
                                            const demandForDay = demands.find(d => d.day_of_week === dayOfWeek);
                                            const requiredForThisDay = demandForDay ? demandForDay.required_employees : 1;
                                            const isCellNeeded = slotIndex < requiredForThisDay;

                                            return (
                                                <td key={dayIdx} className="p-2 border-b border-r align-top bg-white min-h-[60px] hover:bg-slate-50">
                                                    {isCellNeeded ? (
                                                        <div className="h-12 rounded border-2 border-dashed border-blue-200 flex items-center justify-center bg-blue-50/30 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
                                                            <span className="text-xs text-blue-400 font-medium">+ Add Emp</span>
                                                        </div>
                                                    ) : (
                                                        <div className="h-12 rounded bg-gray-100 flex items-center justify-center border border-gray-100">
                                                            <span className="text-xs text-gray-400">Not Required</span>
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ));
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* --- NEW: Optimization Weights Modal --- */}
            {isSettingsOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto relative">
                        {/* Close button */}
                        <button 
                            onClick={() => setIsSettingsOpen(false)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
                        >
                            <X size={24} />
                        </button>

                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-slate-800">Optimization Weights</h2>
                            <p className="text-sm text-slate-500 mt-1">
                                Adjust the penalty weights for the solver. Higher numbers mean the algorithm will try harder to avoid breaking these rules.
                            </p>
                        </div>
                        
                        <form onSubmit={handleSaveWeights} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                
                                {/* Strict Penalties Section */}
                                <div className="space-y-4 bg-red-50/50 p-5 rounded-xl border border-red-100">
                                    <h4 className="font-semibold text-red-800 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                        Strict Penalties
                                    </h4>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Rest Gap Penalty</label>
                                        <input type="number" min="0" value={weights.rest_gap} onChange={(e) => setWeights({...weights, rest_gap: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Consecutive Nights Penalty</label>
                                        <input type="number" min="0" value={weights.consecutive_nights} onChange={(e) => setWeights({...weights, consecutive_nights: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Target Shifts Penalty</label>
                                        <input type="number" min="0" value={weights.target_shifts} onChange={(e) => setWeights({...weights, target_shifts: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition" />
                                    </div>
                                </div>

                                {/* Global Shift Limits Section */}
                                <div className="space-y-4 bg-blue-50/50 p-5 rounded-xl border border-blue-100">
                                    <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        Global Shift Limits
                                    </h4>
                                    
                                    {/* Mornings */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Min Mornings</label>
                                            <input type="number" min="0" value={weights.min_mornings} onChange={(e) => setWeights({...weights, min_mornings: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Max Mornings</label>
                                            <input type="number" min="0" value={weights.max_mornings} onChange={(e) => setWeights({...weights, max_mornings: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
                                        </div>
                                    </div>

                                    {/* Evenings */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Min Evenings</label>
                                            <input type="number" min="0" value={weights.min_evenings} onChange={(e) => setWeights({...weights, min_evenings: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Max Evenings</label>
                                            <input type="number" min="0" value={weights.max_evenings} onChange={(e) => setWeights({...weights, max_evenings: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
                                        </div>
                                    </div>

                                    {/* Nights */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Min Nights</label>
                                            <input type="number" min="0" value={weights.min_nights} onChange={(e) => setWeights({...weights, min_nights: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Max Nights</label>
                                            <input type="number" min="0" value={weights.max_nights} onChange={(e) => setWeights({...weights, max_nights: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Actions */}
                            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-200">
                                <button 
                                    type="button" 
                                    onClick={() => setIsSettingsOpen(false)} 
                                    className="px-5 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting} 
                                    className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                            Saving...
                                        </>
                                    ) : (
                                        'Save Weights'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}