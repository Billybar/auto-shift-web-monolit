// frontend/src/features/schedule/SchedulePage.tsx

import React, { useState, useEffect } from 'react';
import { getLocationById } from '../../api/locations';
import { getShiftDefinitions, getShiftDemands } from '../../api/shiftDefinitions'; 
import type { LocationData, ShiftDefinition, ShiftDemand } from '../../types';
import { Settings, Play, Save } from 'lucide-react';

// --- Utility function to get the upcoming Sunday ---
const getNextSunday = (): Date => {
    const today = new Date();
    // getDay() returns 0 for Sunday, 1 for Monday, etc.
    const daysUntilSunday = 7 - today.getDay();
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + daysUntilSunday);
    nextSunday.setHours(0, 0, 0, 0);
    return nextSunday;
};

// --- Utility function to generate an array of 7 consecutive dates ---
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
    
    // Maps a shift_id to its array of daily demands
    const [shiftDemandsMap, setShiftDemandsMap] = useState<Record<number, ShiftDemand[]>>({});
    
    // --- Date States ---
    const [weekStart, setWeekStart] = useState<Date>(getNextSunday());
    const weekDates = generateWeekDates(weekStart);

    // --- UI States ---
    const [loading, setLoading] = useState<boolean>(true);

    // Hardcoded for MVP
    const CURRENT_LOCATION_ID = 3; 

    // Fetch basic structure data (Location info, Shift Types, and their Daily Demands)
    const fetchBoardStructure = async () => {
        try {
            setLoading(true);
            
            // 1. Fetch location and shift definitions concurrently
            const [locData, shiftsData] = await Promise.all([
                getLocationById(CURRENT_LOCATION_ID),
                getShiftDefinitions(CURRENT_LOCATION_ID)
            ]);
            
            // 2. Fetch demands for all fetched shifts concurrently
            const demandsPromises = shiftsData.map(shift => getShiftDemands(shift.id));
            const demandsResults = await Promise.all(demandsPromises);
            
            // 3. Map the demands to their corresponding shift IDs for O(1) lookup
            const demandsMap: Record<number, ShiftDemand[]> = {};
            shiftsData.forEach((shift, index) => {
                demandsMap[shift.id] = demandsResults[index];
            });

            setLocation(locData);
            setShiftDefinitions(shiftsData);
            setShiftDemandsMap(demandsMap);
        } catch (error) {
            console.error("Failed to fetch board structure:", error);
        } finally {
            setLoading(false);
        }
    };

    // Load structure on component mount
    useEffect(() => {
        fetchBoardStructure();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col space-y-4">
            {/* Header Actions */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-gray-800">Weekly Schedule Board</h2>
                    <p className="text-sm text-gray-500">
                        Location: {location?.name} | Week of: {weekStart.toLocaleDateString('en-US')}
                    </p>
                </div>
                
                <div className="flex space-x-3 space-x-reverse">
                    <button className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition border border-slate-300">
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
                                {/* Top-left empty header cell */}
                                <th className="p-3 border-b border-r bg-slate-50 font-semibold text-slate-700 w-40 sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb]">
                                    Shift / Day
                                </th>
                                
                                {/* Days of the week headers */}
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
                            {/* Iterate over each shift definition */}
                            {shiftDefinitions.map((shift) => {
                                // Retrieve the demands for this specific shift
                                const demands = shiftDemandsMap[shift.id] || [];
                                
                                // Find the maximum number of employees required on any given day for this shift.
                                // If no demands are defined, default to 1 so the shift is at least visible.
                                const maxRequired = demands.length > 0 
                                    ? Math.max(...demands.map(d => d.required_employees)) 
                                    : 1; 

                                // Create an array to map over for each required row (slot)
                                const slots = Array.from({ length: maxRequired });

                                return slots.map((_, slotIndex) => (
                                    <tr key={`${shift.id}-slot-${slotIndex}`} className="hover:bg-slate-50/50 transition">
                                        
                                        {/* Shift Name Column (Sticky on the left)
                                            Only rendered on the first slot of the shift, spanning downwards.
                                        */}
                                        {slotIndex === 0 && (
                                            <td 
                                                rowSpan={maxRequired} 
                                                className="p-3 border-b border-r bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb] align-top"
                                            >
                                                <div className="font-medium text-slate-800">{shift.name}</div>
                                                <div className="text-xs text-slate-500">{shift.start_time} - {shift.end_time}</div>
                                            </td>
                                        )}
                                        
                                        {/* Cells for each day representing an employee slot */}
                                        {weekDates.map((date, dayIdx) => {
                                            const dayOfWeek = date.getDay(); // 0 for Sunday, 6 for Saturday
                                            
                                            // Check the specific demand for this day of the week
                                            const demandForDay = demands.find(d => d.day_of_week === dayOfWeek);
                                            const requiredForThisDay = demandForDay ? demandForDay.required_employees : 1;

                                            // Determine if this specific cell is needed based on the daily demand
                                            const isCellNeeded = slotIndex < requiredForThisDay;

                                            return (
                                                <td key={dayIdx} className="p-2 border-b border-r align-top bg-white min-h-[60px] hover:bg-slate-50">
                                                    {isCellNeeded ? (
                                                        // Active slot - ready for an assignment
                                                        <div className="h-12 rounded border-2 border-dashed border-blue-200 flex items-center justify-center bg-blue-50/30 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
                                                            <span className="text-xs text-blue-400 font-medium">+ Add Emp</span>
                                                        </div>
                                                    ) : (
                                                        // Inactive slot - no employee required here
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
        </div>
    );
}