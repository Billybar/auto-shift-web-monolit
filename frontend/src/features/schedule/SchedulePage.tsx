// frontend/src/features/schedule/SchedulePage.tsx
import EmployeeModal from '../employees/EmployeeModal';
import React, { useState, useEffect } from 'react';
import { getLocationById, getLocationWeights, updateLocationWeights } from '../../api/locations';
import { getShiftDefinitions, getShiftDemands } from '../../api/shiftDefinitions';
import { getAssignments, generateAutoSchedule, saveAssignments } from '../../api/assignments';
import { getEmployeesByLocation } from '../../api/employees';
import EmployeeSidebar from './EmployeeSidebar';
import ScheduleGrid from './ScheduleGrid';
import type { LocationData, ShiftDefinition, ShiftDemand, LocationWeights,Assignment, Employee } from '../../types';
import { Settings, Play, Save, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types/index';
import { LocationProvider, useAppLocation } from '../../context/LocationContext';

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

// Helper to format Date to YYYY-MM-DD for backend comparison
const formatDateStr = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function SchedulePage() {
    // --- Auth State ---
    const { user } = useAuth();
    // Check if the current user is restricted to employee view only
    const isEmployee = user?.role === UserRole.EMPLOYEE;
    
    // --- Location State ---
    const { selectedLocationId } = useAppLocation();

    // --- Data States ---
    const [location, setLocation] = useState<LocationData | null>(null);
    const [shiftDefinitions, setShiftDefinitions] = useState<ShiftDefinition[]>([]);
    const [shiftDemandsMap, setShiftDemandsMap] = useState<Record<number, ShiftDemand[]>>({});
    
    // -- Emplotee State ---
    const [employeesMap, setEmployeesMap] = useState<Record<number, Employee>>({});

    // --- Assignments State ---
    const [assignments, setAssignments] = useState<Assignment[]>([]);

    // --- Date States ---
    // Added setWeekStart and used lazy initialization to avoid calling getNextSunday on every render
    const [weekStart, setWeekStart] = useState<Date>(getNextSunday);
    const weekDates = generateWeekDates(weekStart);

    // Week Navigation Handlers ---
    const handlePrevWeek = () => {
        setWeekStart((prevDate) => {
            const newDate = new Date(prevDate);
            newDate.setDate(newDate.getDate() - 7);
            return newDate;
        });
    };

    const handleNextWeek = () => {
        setWeekStart((prevDate) => {
            const newDate = new Date(prevDate);
            newDate.setDate(newDate.getDate() + 7);
            return newDate;
        });
    };

    // --- UI States ---
    const [loading, setLoading] = useState<boolean>(true);
    const [isGenerating, setIsGenerating] = useState<boolean>(false); // Track engine status
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [employeeSearchTerm, setEmployeeSearchTerm] = useState<string>('');
    const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState<boolean>(false);
    const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);

    // --- Modal & Weights States ---
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false); 
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    
    // Initialize with safe defaults, will be overwritten by fetch
    const [weights, setWeights] = useState<LocationWeights>({
        target_shifts: 40, rest_gap: 40, consecutive_nights: 100, max_nights: 5,
        max_mornings: 6, max_evenings: 2, min_nights: 0, min_mornings: 0, min_evenings: 0,
    });

    const fetchBoardStructure = async () => {
        // Prevent fetching if no location is selected
        if (!selectedLocationId) return;

        try {
            setLoading(true);
            
            const startDateStr = formatDateStr(weekDates[0]);
            const endDateStr = formatDateStr(weekDates[6]);

            // 1. Fetch structure, assignments, AND EMPLOYEES simultaneously
            const [locData, shiftsData, weightsData, boardAssignments, employeesData] = await Promise.all([
                getLocationById(selectedLocationId),
                getShiftDefinitions(selectedLocationId),
                getLocationWeights(selectedLocationId),
                getAssignments(selectedLocationId, startDateStr, endDateStr),
                getEmployeesByLocation(selectedLocationId)
            ]);
            
            // 2. Fetch demands for all fetched shifts
            const demandsPromises = shiftsData.map(shift => getShiftDemands(shift.id));
            const demandsResults = await Promise.all(demandsPromises);
            
            const demandsMap: Record<number, ShiftDemand[]> = {};
            shiftsData.forEach((shift, index) => {
                demandsMap[shift.id] = demandsResults[index];
            });

            // 3. orgenize emp dict by ID
            const empMap: Record<number, Employee> = {};
            employeesData.forEach(emp => {
                empMap[emp.id] = emp;
            });

            // 4. Update States
            setLocation(locData);
            setShiftDefinitions(shiftsData);
            setShiftDemandsMap(demandsMap);
            setWeights(weightsData);
            setAssignments(boardAssignments); // Load existing assignments
            setEmployeesMap(empMap);


        } catch (error) {
            console.error("Failed to fetch board structure:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBoardStructure();
        // Re-fetch data whenever weekStart or the selected location changes
    }, [weekStart, selectedLocationId]);

    // --- Handle Form Submit ---
    const handleSaveWeights = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            const updatedWeights = await updateLocationWeights(selectedLocationId, weights);
            setWeights(updatedWeights);
            setIsSettingsOpen(false);
        } catch (error) {
            console.error("Failed to update weights:", error);
            alert("Failed to save optimization settings.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAutoAssign = async () => {
        if (!window.confirm("Running the engine will overwrite the current schedule for this week. Proceed?")) return;
        
        if (!window.confirm("Generate a new smart schedule? This will replace your current unsaved view.")) return;
        
        try {
            setIsGenerating(true);
            const startDateStr = formatDateStr(weekDates[0]);
            
            // 1. Tell backend to run the solver and GET the draft result
            const response = await generateAutoSchedule(selectedLocationId, startDateStr);
            
            // 2. Extract the draft assignments and set them directly to the state (No DB fetch)
            // Ensure we handle the nested 'draft_assignments' key from the backend response
            const draftAssignments = response.draft_assignments || [];
            
            setAssignments(draftAssignments);
            
        } catch (error) {
            console.error("Engine generation failed:", error);
            alert("The optimization engine failed. Check backend logs for infeasibility issues.");
        } finally {
            setIsGenerating(false);
        }
    };

    // --- Handle Save Schedule ---
    const handleSaveSchedule = async () => {
        if (!window.confirm("Are you sure you want to save this schedule to the database?")) return;
        
        try {
            setIsSaving(true);
            const startDateStr = formatDateStr(weekDates[0]);
            const endDateStr = formatDateStr(weekDates[6]);
            
            // Call the updated API function
            const result = await saveAssignments(
                selectedLocationId, 
                startDateStr, 
                endDateStr, 
                assignments
            );
            
            // Updated alert messages to use 'saved' instead of 'published'
            alert(`Schedule saved successfully!\nAdded: ${result.added}, Removed: ${result.removed}, Unchanged: ${result.unchanged}`);
            
        } catch (error) {
            console.error("Failed to save schedule:", error);
            alert("Failed to save schedule. Please check your connection or permissions.");
        } finally {
            setIsSaving(false);
        }
    };

    // --- Handle Drag and Drop Logic ---
    const handleDrop = (
        e: React.DragEvent,
        targetDate: string,
        targetShiftId: number,
        targetEmployeeId: number | null
    ) => {
        e.preventDefault(); // Required to allow dropping
        
        const payloadStr = e.dataTransfer.getData('application/json');
        if (!payloadStr) return;
        
        const payload = JSON.parse(payloadStr);
        const sourceEmployeeId = payload.employee_id;
        
        if (!sourceEmployeeId || sourceEmployeeId === targetEmployeeId) return;

        setAssignments(prev => {
            let newAssignments = [...prev];

            if (payload.type === 'FROM_SIDEBAR') {
                if (targetEmployeeId) {
                    // REPLACE: Remove the current employee from this slot
                    newAssignments = newAssignments.filter(a => 
                        !(a.shift_id === targetShiftId && a.date === targetDate && a.employee_id === targetEmployeeId)
                    );
                }
                
                // ADD: Insert the new employee from the sidebar
                // (Prevent duplicate if already assigned to this exact shift/date)
                const exists = newAssignments.some(a => a.shift_id === targetShiftId && a.date === targetDate && a.employee_id === sourceEmployeeId);
                if (!exists) {
                    // Note: If your Assignment type requires an 'id', you can generate a temporary negative one, 
                    // or just omit it if your backend handles new inserts without IDs.
                    newAssignments.push({
                        shift_id: targetShiftId,
                        date: targetDate,
                        employee_id: sourceEmployeeId
                    } as Assignment);
                }
                
            } else if (payload.type === 'FROM_BOARD') {
                const sourceShiftId = payload.shift_id;
                const sourceDate = payload.date;

                const sourceIndex = newAssignments.findIndex(a => a.shift_id === sourceShiftId && a.date === sourceDate && a.employee_id === sourceEmployeeId);
                
                if (sourceIndex > -1) {
                    if (targetEmployeeId) {
                        // SWAP: Find target and swap their employee_ids
                        const targetIndex = newAssignments.findIndex(a => a.shift_id === targetShiftId && a.date === targetDate && a.employee_id === targetEmployeeId);
                        if (targetIndex > -1) {
                            newAssignments[sourceIndex] = { ...newAssignments[sourceIndex], employee_id: targetEmployeeId };
                            newAssignments[targetIndex] = { ...newAssignments[targetIndex], employee_id: sourceEmployeeId };
                        }
                    } else {
                        // MOVE: Update the existing assignment to the new empty slot location
                        newAssignments[sourceIndex] = {
                            ...newAssignments[sourceIndex],
                            shift_id: targetShiftId,
                            date: targetDate
                        };
                    }
                }
            }
            return newAssignments;
        });
    };

    // --- Handle Remove Assignment ---
    const handleRemove = (shiftId: number, dateStr: string, employeeId: number) => {
        // Filter out the exact assignment matching the shift, date, and employee
        setAssignments(prev => prev.filter(a => 
            !(a.shift_id === shiftId && a.date === dateStr && a.employee_id === employeeId)
        ));
    };

    // Handler to open the modal for a specific employee
    const handleOpenEditModal = (employeeId: number) => {
        setEditingEmployeeId(employeeId);
        setIsEmployeeModalOpen(true);
    };

    // Prompt the user to select a location if none is selected
    if (!selectedLocationId) {
        return (
            <div className="flex justify-center items-center h-full flex-col gap-4 text-slate-500">
                <Settings size={48} className="text-slate-300" />
                <h2 className="text-xl font-medium">Please select a location to view the schedule</h2>
            </div>
        );
    }
    
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
                <div className="flex justify-between items-center mb-4 gap-6 flex-wrap">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">סידור שבועי</h2>
                        <p className="text-sm text-gray-500">
                            אתר: {location?.name}
                        </p>
                    </div>
                    
                    {/* Week Navigation Controls */}
                    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                        <button 
                            onClick={handlePrevWeek}
                            className="p-1.5 hover:bg-gray-100 rounded transition text-gray-600"
                            title="שבוע הקודם"
                        >
                            <ChevronRight size={20} />
                        </button>
                        
                        <span className="font-medium text-sm text-gray-800 min-w-[140px] text-center">
                            Week of: {weekStart.toLocaleDateString('en-US')}
                        </span>
                        
                        <button 
                            onClick={handleNextWeek}
                            className="p-1.5 hover:bg-gray-100 rounded transition text-gray-600"
                            title="שבוע הבא"
                        >
                            <ChevronLeft size={20} />
                        </button>
                    </div>
                </div>

                {/* Only render action buttons if the user is NOT a regular employee */}
                {!isEmployee && (
                    <div className="flex space-x-3 space-x-reverse">
                        <button 
                            onClick={() => setIsSettingsOpen(true)}
                            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition border border-slate-300"
                        >
                            <Settings size={18} />
                            משקלים
                        </button>
                        
                        <button 
                            onClick={handleAutoAssign}
                            disabled={isGenerating}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                                isGenerating ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                            } text-white`}
                        >
                            {isGenerating ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                                <Play size={18} />
                            )}
                            {isGenerating ? 'מריץ מנוע...' : 'שיבוץ אוטומטי'}
                        </button>

                        {/*  Save button */}
                        <button 
                            onClick={handleSaveSchedule}
                            disabled={isSaving || isGenerating}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
                                isSaving ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                            } text-white`}
                        >
                            {isSaving ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                                <Save size={18} />
                            )}
                            {isSaving ? 'שומר...' : 'שמירה'}
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content Area: Table + Sidebar */}
            <div className="flex flex-row gap-4 flex-grow overflow-hidden">
                
                {/* Clean, Extracted Employee Sidebar Component */}
                {!isEmployee && (
                    <EmployeeSidebar 
                        employeesMap={employeesMap}
                        assignments={assignments}
                        searchQuery={employeeSearchTerm}
                        onSearchChange={setEmployeeSearchTerm}
                        onEditEmployee={handleOpenEditModal}
                        // Make sure to pass your actual variables here!
                        shifts={shiftDefinitions}
                        weekDates={weekDates.map(d => formatDateStr(d))}
                    />
                )}
                 
                {/* The Schedule Grid (Takes up remaining space) */}
                <ScheduleGrid 
                    weekDates={weekDates}
                    shiftDefinitions={shiftDefinitions}
                    shiftDemandsMap={shiftDemandsMap}
                    assignments={assignments}
                    employeesMap={employeesMap}
                    formatDateStr={formatDateStr}
                    // Pass an empty dummy function if it's an employee, to satisfy TypeScript
                    onDrop={isEmployee ? () => {} : handleDrop}
                    onRemove={isEmployee ? () => {} : handleRemove}
                />
            </div>
            
            {/* Shared Employee Edit Modal */}
            {!isEmployee && (
                <EmployeeModal
                    isOpen={isEmployeeModalOpen}
                    onClose={() => setIsEmployeeModalOpen(false)}
                    // Look up the full employee object from the map using the ID we saved in state
                    employee={editingEmployeeId ? employeesMap[editingEmployeeId] : null}
                    locationId={selectedLocationId}
                    onSuccess={() => {
                        // Assuming you have a function to refresh data in SchedulePage (e.g., fetchInitialData)
                        // If you called it something else like loadData or fetchEmployees, put it here.
                        // This ensures the sidebar colors/names update immediately!
                        window.location.reload(); // Temporary fallback until you put your actual fetch function here
                    }}
                />
            )}
            
            {/* --- Optimization Weights Modal --- */}
            {/* Only render if modal is open AND the user is NOT a regular employee */}
            {isSettingsOpen && !isEmployee && (
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