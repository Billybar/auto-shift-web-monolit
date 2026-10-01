// src/features/schedule/ScheduleGrid.tsx
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { X, Plus, Minus, Pencil } from 'lucide-react';

// 1. THE CONTRACT: Everything the Grid needs to function
export interface ScheduleGridProps {
    weekDates: Date[]; 
    shiftDefinitions: any[]; 
    demandMap: Record<string, any>; 
    pendingCells?: Set<string>;
    onChangeSlots?: (shiftId: number, dateStr: string, delta: 1 | -1) => void; 
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

// Helper component for the per-shift edit menu (add / remove an extra row)
function ShiftEditMenu({
    onAddRow,
    onRemoveRow,
    canRemoveRow
}: {
    onAddRow: () => void,
    onRemoveRow: () => void,
    canRemoveRow: boolean
}) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close the menu on outside click or Escape
    useEffect(() => {
        if (!isOpen) return;

        const handleMouseDown = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };

        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    return (
        <div ref={menuRef} className="relative">
            <button
                onClick={() => setIsOpen(prev => !prev)}
                className={`p-1 rounded transition-colors ${isOpen ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
                title="עריכת משמרת"
            >
                <Pencil size={14} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-1 z-30 w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                    <button
                        onClick={() => { onAddRow(); setIsOpen(false); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                        <Plus size={14} /> הוסף שורה
                    </button>
                    {canRemoveRow && (
                        <button
                            onClick={() => { onRemoveRow(); setIsOpen(false); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                            <Minus size={14} /> הסר שורה ריקה
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// 2. THE COMPONENT SHELL
export default function ScheduleGrid({
    weekDates,
    shiftDefinitions,
    demandMap,    
    pendingCells, 
    onChangeSlots,
    assignments,
    employeesMap,
    formatDateStr,
    onDrop,
    onRemove,
    onUpdateHours
}: ScheduleGridProps) {
    
    const assignmentsByCell = useMemo(() => {
        const map: Record<string, any[]> = {};
        assignments.forEach(a => {
            const key = `${a.shift_id}|${a.date}`;
            if (!map[key]) map[key] = [];
            map[key].push(a);
        });
        return map;
    }, [assignments]);

    // UI-only minimum row count per shift (keyed by shift id), set via the shift edit menu
    const [manualRows, setManualRows] = useState<Record<number, number>>({});

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
                            let baseRows = 1;
                            weekDates.forEach(date => {
                                const cellKey = `${shift.id}|${formatDateStr(date)}`;
                                const required = demandMap[cellKey]?.required_employees ?? shift.default_staff_count ?? 1;
                                const assignedCount = (assignmentsByCell[cellKey] || []).length;

                                const neededForDay = Math.max(required, assignedCount);
                                if (neededForDay > baseRows) baseRows = neededForDay;
                            });

                            // Manual rows act as a floor, so filling an extra row does not spawn another one
                            const maxRowsForShift = Math.max(baseRows, manualRows[shift.id] ?? 0);
                            const canRemoveRow = maxRowsForShift > baseRows;

                            const slots = Array.from({ length: maxRowsForShift });

                            return slots.map((_, slotIndex) => {
                                // Check if this is the first row of a new shift group (excluding the very first shift)
                                const isShiftDivider = slotIndex === 0 && shiftIndex > 0;
                                const dividerClass = isShiftDivider ? "border-t-[6px] border-t-slate-400" : "";

                                return (
                                    <tr key={`${shift.id}-slot-${slotIndex}`} className="hover:bg-slate-50/50 transition">
                                    {slotIndex === 0 && (
                                        <td rowSpan={maxRowsForShift} className={`p-3 border-b border-r bg-white sticky left-0 z-10 shadow-[1px_0_0_0_#e5e7eb] align-top text-right ${dividerClass}`}>
                                            <div className="flex items-center gap-1">
                                                {onChangeSlots && (
                                                    <ShiftEditMenu
                                                        onAddRow={() => setManualRows(prev => ({ ...prev, [shift.id]: maxRowsForShift + 1 }))}
                                                        onRemoveRow={() => setManualRows(prev => ({ ...prev, [shift.id]: maxRowsForShift - 1 }))}
                                                        canRemoveRow={canRemoveRow}
                                                    />
                                                )}
                                                <div className="font-medium text-slate-800">{shift.name}</div>
                                            </div>
                                            <div className="text-xs text-slate-500" dir="ltr" style={{ display: 'inline-block' }}>{shift.start_time} - {shift.end_time}</div>
                                        </td>
                                    )}
                                    {weekDates.map((date, dayIdx) => {
                                        const dateStr = formatDateStr(date);
                                        const cellKey = `${shift.id}|${dateStr}`;
                                        
                                        // CHANGED: Leverage hook data for overrides and assignments
                                        const demandInfo = demandMap[cellKey];
                                        const requiredForThisDay = demandInfo?.required_employees ?? shift.default_staff_count ?? 1;
                                        const isOverride = demandInfo?.is_override || false;
                                        
                                        const shiftAssignments = assignmentsByCell[cellKey] || [];
                                        const assignedCount = shiftAssignments.length;
                                        
                                        const slotAssignment = shiftAssignments[slotIndex];
                                        const assignedEmp = slotAssignment ? employeesMap[slotAssignment.employee_id] : null;

                                        const fallbackName = `Emp #${slotAssignment?.employee_id}`;
                                        const displayFirstName = assignedEmp?.user 
                                            ? `${assignedEmp.user.first_name} ${assignedEmp.user.last_name}`.trim() 
                                            : fallbackName;
                                            
                                        // CHANGED: Determine exact cell rendering state
                                        const hasAssignment = slotIndex < assignedCount;
                                        const isExtraAssignment = hasAssignment && slotIndex >= requiredForThisDay;
                                        const isEmptySlot = !hasAssignment && slotIndex < requiredForThisDay;
                                        
                                        const isPending = pendingCells?.has(cellKey);
                                        const overrideBg = isOverride ? 'bg-sky-50' : 'bg-white';
                                        const finalBgClass = `p-1 border-b border-r align-middle hover:bg-slate-50 transition-colors ${dividerClass} ${overrideBg}`;

                                        return (
                                            <td 
                                                    key={dayIdx} 
                                                    className={finalBgClass}
                                                    title={isOverride ? "שונה לשבוע זה" : ""}
                                                    onDragOver={(e) => e.preventDefault()} 
                                                    onDrop={(e) => {
                                                        // BUGFIX: Prevent creating hidden assignments on "Not Required" cells
                                                        if (isEmptySlot || hasAssignment) {
                                                            onDrop(e, dateStr, shift.id, assignedEmp ? assignedEmp.id : null)
                                                        }
                                                    }}
                                                >
                                                
                                                {/* State 1: Assigned Employee Card */}
                                                {hasAssignment && (
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
                                                        // CHANGED: Amber ring for extra assignments
                                                        className={`group relative w-[90%] h-[3.5rem] mx-auto rounded border flex flex-col shadow-sm cursor-grab active:cursor-grabbing transition hover:shadow-md overflow-hidden bg-white ${isExtraAssignment ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-300'}`}
                                                        title={isExtraAssignment ? 'מעל התקן' : ''}
                                                    >
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
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (assignedEmp) onRemove(shift.id, dateStr, assignedEmp.id);
                                                            }}
                                                            className="absolute top-0.5 right-0.5 z-10 bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="Remove from shift"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                )}

                                                {/* State 2: Empty Slot (Invisible Drop Zone) with Hover Minus Button */}
                                                {isEmptySlot && (
                                                    <div className="group relative w-[90%] h-[3.5rem] mx-auto flex items-center justify-center">
                                                        {onChangeSlots && (
                                                            <button
                                                                onClick={() => onChangeSlots(shift.id, dateStr, -1)}
                                                                disabled={isPending}
                                                                className="hidden group-hover:flex w-8 h-8 items-center justify-center bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors disabled:opacity-50"
                                                                title="הסר עמדה"
                                                            >
                                                                <Minus size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                {/* State 3: Not Required (Blank) with Hover Plus Button */}
                                                {!hasAssignment && !isEmptySlot && (
                                                    <div className="group h-10 w-full flex items-center justify-center">
                                                        {onChangeSlots && (
                                                            <button
                                                                onClick={() => onChangeSlots(shift.id, dateStr, 1)}
                                                                disabled={isPending}
                                                                className="hidden group-hover:flex w-7 h-7 items-center justify-center bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition-colors disabled:opacity-50"
                                                                title="הוסף עמדה"
                                                            >
                                                                <Plus size={16} />
                                                            </button>
                                                        )}
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