// src/features/schedule/ScheduleGrid.tsx
import React from 'react';
import { X } from 'lucide-react'; 

// 1. THE CONTRACT: Everything the Grid needs to function
export interface ScheduleGridProps {
    weekDates: Date[]; 
    shiftDefinitions: any[]; 
    shiftDemandsMap: any; 
    assignments: any[]; 
    employeesMap: Record<number, any>; 
    
    // Helper function used in the HTML
    formatDateStr: (d: Date) => string; 
    
    // Event Handlers for Drag & Drop
    onDrop: (e: React.DragEvent, targetDate: string, targetShiftId: number, targetEmployeeId: number | null) => void;
    onRemove: (shiftId: number, dateStr: string, employeeId: number) => void;
    onUpdateHours?: (shiftId: number, dateStr: string, employeeId: number, startTime: string, endTime: string) => void;
}

// Helper component for the hours display and editing
function HoursBox({ 
    assignmentStartTime, 
    assignmentEndTime, 
    defaultStartTime, 
    defaultEndTime, 
    onSave 
}: { 
    assignmentStartTime?: string, 
    assignmentEndTime?: string, 
    defaultStartTime: string, 
    defaultEndTime: string, 
    onSave: (start: string, end: string) => void 
}) {
    const [isEditing, setIsEditing] = React.useState(false);
    const [startInput, setStartInput] = React.useState(assignmentStartTime || defaultStartTime);
    const [endInput, setEndInput] = React.useState(assignmentEndTime || defaultEndTime);

    const isStartChanged = assignmentStartTime && assignmentStartTime !== defaultStartTime;
    const isEndChanged = assignmentEndTime && assignmentEndTime !== defaultEndTime;
    
    const displayStart = assignmentStartTime || defaultStartTime;
    const displayEnd = assignmentEndTime || defaultEndTime;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // prevent drag or other interactions
        setIsEditing(true);
    };

    const handleSave = () => {
        setIsEditing(false);
        // Only save if there's a valid change
        if (startInput !== (assignmentStartTime || defaultStartTime) || endInput !== (assignmentEndTime || defaultEndTime)) {
            onSave(startInput, endInput);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setStartInput(assignmentStartTime || defaultStartTime);
            setEndInput(assignmentEndTime || defaultEndTime);
        }
    };

    if (isEditing) {
        return (
            <div 
                className="flex-1 flex items-center justify-center gap-1 bg-stone-200 text-black w-full shadow-inner z-20"
                onClick={e => e.stopPropagation()} // prevent drag
                onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        handleSave();
                    }
                }}
                dir="ltr"
            >
                <input 
                    type="time" 
                    value={startInput} 
                    onChange={e => setStartInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                    className="w-16 text-xs p-0 border border-gray-300 rounded text-center bg-white h-5 outline-none focus:border-blue-400"
                />
                <span className="text-xs leading-none text-slate-500">-</span>
                <input 
                    type="time" 
                    value={endInput} 
                    onChange={e => setEndInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-16 text-xs p-0 border border-gray-300 rounded text-center bg-white h-5 outline-none focus:border-blue-400"
                />
            </div>
        );
    }

    return (
        <div 
            onClick={handleClick}
            className="flex-1 flex items-center justify-center gap-1 bg-stone-200 text-stone-400 w-full cursor-pointer hover:bg-stone-300 transition"
            title="Click to edit hours"
            dir="ltr"
        >
            <span className={`text-xs leading-none px-1.5 py-0.5 ${isStartChanged ? 'bg-blue-500 text-white rounded' : ''}`}>
                {displayStart}
            </span>
            <span className="text-xs leading-none text-slate-400">-</span>
            <span className={`text-xs leading-none px-1.5 py-0.5 ${isEndChanged ? 'bg-blue-500 text-white rounded' : ''}`}>
                {displayEnd}
            </span>
        </div>
    );
}

// 2. THE COMPONENT SHELL
export default function ScheduleGrid({
    weekDates,
    shiftDefinitions,
    shiftDemandsMap,
    assignments,
    employeesMap,
    formatDateStr,
    onDrop,
    onRemove,
    onUpdateHours
}: ScheduleGridProps) {
    
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-grow overflow-auto flex flex-col">
            <div className="overflow-x-auto h-full">
                <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                        <tr>
                            <th className="p-3 border-b border-r bg-slate-50 font-semibold text-slate-700 w-28 sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb] text-right">
                                יום / משמרת
                            </th>
                            {weekDates.map((date, idx) => (
                                <th key={idx} className="p-3 border-b border-r bg-slate-50 text-center w-32">
                                    <div className="font-semibold text-slate-700">
                                        {date.toLocaleDateString('he-IL', { weekday: 'short' })}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {date.toLocaleDateString('he-IL', { month: 'numeric', day: 'numeric' })}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shiftDefinitions.map((shift, shiftIndex) => {
                            const demands = shiftDemandsMap[shift.id] || [];
                            const maxRequired = demands.length > 0 
                                ? Math.max(...demands.map((d: any) => d.required_employees)) 
                                : 1; 
                            const slots = Array.from({ length: maxRequired });

                            return slots.map((_, slotIndex) => {
                                // Check if this is the first row of a new shift group (excluding the very first shift)
                                const isShiftDivider = slotIndex === 0 && shiftIndex > 0;
                                const dividerClass = isShiftDivider ? "border-t-[6px] border-t-slate-400" : "";

                                return (
                                    <tr key={`${shift.id}-slot-${slotIndex}`} className="hover:bg-slate-50/50 transition">
                                    {slotIndex === 0 && (
                                        <td rowSpan={maxRequired} className={`p-3 border-b border-r bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb] align-top text-right ${dividerClass}`}>
                                            <div className="font-medium text-slate-800">{shift.name}</div>
                                            <div className="text-xs text-slate-500" dir="ltr" style={{ display: 'inline-block' }}>{shift.start_time} - {shift.end_time}</div>
                                        </td>
                                    )}
                                    {weekDates.map((date, dayIdx) => {
                                        const dayOfWeek = date.getDay();
                                        const dateStr = formatDateStr(date);
                                        
                                        const demandForDay = demands.find((d: any) => d.day_of_week === dayOfWeek);
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
                                        // CHANGED: Extract the name from the nested user object safely
                                        const displayFirstName = assignedEmp?.user 
                                            ? `${assignedEmp.user.first_name} ${assignedEmp.user.last_name}`.trim() 
                                            : fallbackName;
                                            
                                        return (
                                            <td 
                                                    key={dayIdx} 
                                                    className={`p-1 border-b border-r align-middle bg-white hover:bg-slate-50 ${dividerClass}`}
                                                    // Allow dropping on this cell
                                                    onDragOver={(e) => e.preventDefault()} 
                                                    // Execute the logic when item is dropped
                                                    onDrop={(e) => onDrop(e, dateStr, shift.id, assignedEmp ? assignedEmp.id : null)}
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
                                                            className="group relative w-[90%] h-[3.5rem] mx-auto rounded border border-slate-300 flex flex-col shadow-sm cursor-grab active:cursor-grabbing transition hover:shadow-md overflow-hidden bg-white"
                                                        >
                                                            {/* TOP HALF: Employee Name */}
                                                            <div 
                                                                className="w-full flex-1 flex items-center justify-center border-b border-slate-200"
                                                                style={{ 
                                                                    backgroundColor: assignedEmp?.color ? (assignedEmp.color.startsWith('#') ? assignedEmp.color : `#${assignedEmp.color}`) : '#cbd5e1',
                                                                    color: '#1e293b' 
                                                                }}
                                                            >
                                                                <span className="text-xs font-semibold truncate px-1 w-full text-center">
                                                                    {displayFirstName}
                                                                </span>
                                                            </div>
                                                            
                                                            {/* BOTTOM HALF: Hours */}
                                                            <HoursBox 
                                                                assignmentStartTime={slotAssignment.start_time}
                                                                assignmentEndTime={slotAssignment.end_time}
                                                                defaultStartTime={shift.start_time}
                                                                defaultEndTime={shift.end_time}
                                                                onSave={(start, end) => {
                                                                    if (onUpdateHours && assignedEmp) {
                                                                        onUpdateHours(shift.id, dateStr, assignedEmp.id, start, end);
                                                                    }
                                                                }}
                                                            />

                                                            {/* Delete button: visible only when hovering over the parent group */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation(); // Prevents other click events from firing
                                                                    if (assignedEmp) onRemove(shift.id, dateStr, assignedEmp.id);
                                                                }}
                                                                className="absolute top-0.5 right-0.5 z-10 bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
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
    );
}