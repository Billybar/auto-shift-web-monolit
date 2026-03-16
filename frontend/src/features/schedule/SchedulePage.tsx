// frontend/src/features/schedule/SchedulePage.tsx
import EmployeeModal from '../employees/EmployeeModal';
import React, { useState, useEffect } from 'react';
import { getLocationById, getLocationWeights, updateLocationWeights } from '../../api/locations';
import { getShiftDefinitions, getShiftDemands } from '../../api/shiftDefinitions';
import { getAssignments, generateAutoSchedule, saveAssignments } from '../../api/assignments';
import { getEmployeesByLocation } from '../../api/employees';
import type { LocationData, ShiftDefinition, ShiftDemand, LocationWeights,Assignment, Employee } from '../../types';
import { Settings, Play, Save, X, Search, Edit } from 'lucide-react';

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
    // --- Data States ---
    const [location, setLocation] = useState<LocationData | null>(null);
    const [shiftDefinitions, setShiftDefinitions] = useState<ShiftDefinition[]>([]);
    const [shiftDemandsMap, setShiftDemandsMap] = useState<Record<number, ShiftDemand[]>>({});
    
    // -- Emplotee State ---
    const [employeesMap, setEmployeesMap] = useState<Record<number, Employee>>({});

    // --- Assignments State ---
    const [assignments, setAssignments] = useState<Assignment[]>([]);

    // --- Date States ---
    const [weekStart] = useState<Date>(getNextSunday());
    const weekDates = generateWeekDates(weekStart);

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

    const CURRENT_LOCATION_ID = 3; 

    const fetchBoardStructure = async () => {
        try {
            setLoading(true);
            
            const startDateStr = formatDateStr(weekDates[0]);
            const endDateStr = formatDateStr(weekDates[6]);

            // 1. Fetch structure, assignments, AND EMPLOYEES simultaneously
            const [locData, shiftsData, weightsData, boardAssignments, employeesData] = await Promise.all([
                getLocationById(CURRENT_LOCATION_ID),
                getShiftDefinitions(CURRENT_LOCATION_ID),
                getLocationWeights(CURRENT_LOCATION_ID),
                getAssignments(CURRENT_LOCATION_ID, startDateStr, endDateStr),
                getEmployeesByLocation(CURRENT_LOCATION_ID)
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
    }, []);

    // --- Handle Form Submit ---
    const handleSaveWeights = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            const updatedWeights = await updateLocationWeights(CURRENT_LOCATION_ID, weights);
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
            const response = await generateAutoSchedule(CURRENT_LOCATION_ID, startDateStr);
            
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
                CURRENT_LOCATION_ID, 
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

    // Filter employees: keep only active ones, and filter by search term if exists
    const filteredSidebarEmployees = Object.values(employeesMap).filter(emp => {
        if (!emp.is_active) return false;
        if (employeeSearchTerm.trim() === '') return true;
        return emp.name.toLowerCase().includes(employeeSearchTerm.toLowerCase());
    });

    // Handler to open the modal for a specific employee
    const handleOpenEditModal = (employeeId: number) => {
        setEditingEmployeeId(employeeId);
        setIsEmployeeModalOpen(true);
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
                        Weights
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
                        {isGenerating ? 'Running Engine...' : 'Auto Assign'}
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
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>

            {/* Main Content Area: Table + Sidebar */}
            <div className="flex flex-row gap-4 flex-grow overflow-hidden">
                
                {/* Employee Sidebar */}
                <div className="w-64 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden shrink-0">
                    {/* Sidebar Header */}
                    <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-700 text-sm">Employees</h3>
                            {/* Display the count of currently visible filtered employees */}
                            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                                {filteredSidebarEmployees.length}
                            </span>
                        </div>
                        {/* Search Input */}
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                                <Search size={14} className="text-slate-400" />
                            </div>
                            <input
                                type="text"
                                placeholder="Search employee..."
                                value={employeeSearchTerm}
                                onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    
                    {/* Draggable Filtered Employee List */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {filteredSidebarEmployees.map(emp => (
                            // Wrapper div to hold both the draggable area and the edit button
                            <div key={`sidebar-emp-${emp.id}`} className="flex items-center gap-1 w-full">
                                
                                {/* 1. The Draggable Area (Takes most of the space) */}
                                <div 
                                    draggable 
                                    onDragStart={(e) => {
                                        const payload = { type: 'FROM_SIDEBAR', employee_id: emp.id };
                                        e.dataTransfer.setData('application/json', JSON.stringify(payload));
                                    }}
                                    // Changed width from w-full to flex-1 so it shares space with the button
                                    className="h-9 flex-1 rounded border border-slate-200 flex items-center justify-center shadow-sm cursor-grab active:cursor-grabbing hover:opacity-80 transition"
                                    style={{ 
                                        backgroundColor: emp.color ? (emp.color.startsWith('#') ? emp.color : `#${emp.color}`) : '#cbd5e1',
                                        color: '#1e293b' 
                                    }}
                                >
                                    <span className="text-xs font-semibold truncate px-2 drop-shadow-sm">
                                        {emp.name}
                                    </span>
                                </div>

                                {/* 2. The Edit Button (Fixed width, independent click event) */}
                                <button
                                    onClick={() => handleOpenEditModal(emp.id)}
                                    className="h-9 w-9 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition shadow-sm shrink-0"
                                    title={`Edit ${emp.name}`}
                                >
                                    <Edit size={14} />
                                </button>

                            </div>
                        ))}
                    </div>
                </div>

                {/* The Schedule Grid (Takes up remaining space) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-grow overflow-auto flex flex-col">
                    <div className="overflow-x-auto h-full">
                    <table className="w-full text-left border-collapse min-w-max">
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
                            {shiftDefinitions.map((shift, shiftIndex) => {
                                const demands = shiftDemandsMap[shift.id] || [];
                                const maxRequired = demands.length > 0 
                                    ? Math.max(...demands.map(d => d.required_employees)) 
                                    : 1; 
                                const slots = Array.from({ length: maxRequired });

                                return slots.map((_, slotIndex) => {
                                    // Check if this is the first row of a new shift group (excluding the very first shift)
                                    const isShiftDivider = slotIndex === 0 && shiftIndex > 0;
                                    const dividerClass = isShiftDivider ? "border-t-[6px] border-t-slate-400" : "";

                                    return (
                                        <tr key={`${shift.id}-slot-${slotIndex}`} className="hover:bg-slate-50/50 transition">
                                        {slotIndex === 0 && (
                                           <td rowSpan={maxRequired} className={`p-3 border-b border-r bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb] align-top ${dividerClass}`}>
                                                <div className="font-medium text-slate-800">{shift.name}</div>
                                                <div className="text-xs text-slate-500">{shift.start_time} - {shift.end_time}</div>
                                            </td>
                                        )}
                                        {weekDates.map((date, dayIdx) => {
                                            const dayOfWeek = date.getDay();
                                            const dateStr = formatDateStr(date);
                                            
                                            const demandForDay = demands.find(d => d.day_of_week === dayOfWeek);
                                            const requiredForThisDay = demandForDay ? demandForDay.required_employees : 1;
                                            const isCellNeeded = slotIndex < requiredForThisDay;

                                            // 1. Find the assignment for this slot
                                            const shiftAssignments = assignments.filter(
                                                a => a.shift_id === shift.id && a.date === dateStr
                                            );
                                            const slotAssignment = shiftAssignments[slotIndex];
                                            
                                            // 2. Find the employee object from our map
                                            const assignedEmp = slotAssignment ? employeesMap[slotAssignment.employee_id] : null;

                                            const fallbackName = `Emp #${slotAssignment?.employee_id}`;
                                            const displayFirstName = assignedEmp?.name || fallbackName;
                                            // const displayLastName = assignedEmp?.last_name ? ` ${assignedEmp.last_name.charAt(0)}.` : '';

                                            return (
                                                <td 
                                                        key={dayIdx} 
                                                        className={`p-1 border-b border-r align-middle bg-white hover:bg-slate-50 ${dividerClass}`}
                                                        // Allow dropping on this cell
                                                        onDragOver={(e) => e.preventDefault()} 
                                                        // Execute the logic when item is dropped
                                                        onDrop={(e) => handleDrop(e, dateStr, shift.id, assignedEmp ? assignedEmp.id : null)}
                                                    >
                                                    {isCellNeeded ? (
                                                        slotAssignment ? (
                                                            // RENDER THE ASSIGNED EMPLOYEE WITH DB COLORS OR FALLBACK
                                                            <div 
                                                                draggable
                                                                onDragStart={(e) => {
                                                                    const payload = { 
                                                                        type: 'FROM_BOARD', 
                                                                        employee_id: assignedEmp?.id,
                                                                        shift_id: shift.id,
                                                                        date: dateStr,
                                                                        slotIndex: slotIndex
                                                                    };
                                                                    e.dataTransfer.setData('application/json', JSON.stringify(payload));
                                                                }}
                                                                // Added 'group' and 'relative' for the hover 'X' button
                                                                className="group relative w-[80%] h-[80%] min-h-[3.5rem] mx-auto rounded border border-slate-200 flex items-center justify-center shadow-sm cursor-grab active:cursor-grabbing transition hover:opacity-80"
                                                                style={{ 
                                                                    backgroundColor: assignedEmp?.color ? (assignedEmp.color.startsWith('#') ? assignedEmp.color : `#${assignedEmp.color}`) : '#cbd5e1',
                                                                    color: '#1e293b' 
                                                                }}
                                                            >
                                                                <span className="text-xs font-semibold truncate px-1">
                                                                    {displayFirstName}
                                                                </span>

                                                                {/* Delete button: visible only when hovering over the parent group */}
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation(); // Prevents other click events from firing
                                                                        if (assignedEmp) handleRemove(shift.id, dateStr, assignedEmp.id);
                                                                    }}
                                                                    className="absolute -top-2 -right-2 bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    title="Remove from shift"
                                                                >
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            // Empty slot ready for manual assignment
                                                            <div className="h-10 w-full rounded border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 cursor-pointer hover:border-slate-400 hover:bg-slate-100 transition">
                                                                <span className="text-xs text-blue-400 font-medium">+ Add Emp</span>
                                                            </div>
                                                        )
                                                    ) : (
                                                        <div className="h-10 w-full rounded bg-slate-100/50 flex items-center justify-center border border-slate-100">
                                                            <span className="text-xs text-slate-300">Not Required</span>
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                )});
                            })}
                        </tbody>
                    </table>
                </div>
                </div>
            </div>
            
            {/* Shared Employee Edit Modal */}
            <EmployeeModal
                isOpen={isEmployeeModalOpen}
                onClose={() => setIsEmployeeModalOpen(false)}
                // Look up the full employee object from the map using the ID we saved in state
                employee={editingEmployeeId ? employeesMap[editingEmployeeId] : null}
                locationId={CURRENT_LOCATION_ID}
                onSuccess={() => {
                    // Assuming you have a function to refresh data in SchedulePage (e.g., fetchInitialData)
                    // If you called it something else like loadData or fetchEmployees, put it here.
                    // This ensures the sidebar colors/names update immediately!
                    window.location.reload(); // Temporary fallback until you put your actual fetch function here
                }}
            />
            
            {/* --- Optimization Weights Modal --- */}
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