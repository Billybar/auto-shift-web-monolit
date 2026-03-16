import React, { useState, useEffect } from 'react';
import { Check, Edit } from 'lucide-react';
import { getEmployeeConstraints } from '../../api/constrains';
// If you have strict types, import them here. Using 'any' as a fallback for now.

interface EmployeeSidebarRowProps {
    emp: any; 
    assignments: any[]; 
    onEdit: (employeeId: number) => void;
    weekDates: string[];
    shifts: any[];
}

export default function SidebarEmployeeRow({ 
    emp, 
    assignments, 
    onEdit, 
    weekDates, 
    shifts 
}: EmployeeSidebarRowProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [popupPos, setPopupPos] = useState({ top: 0, right: 0 });
    const [constraints, setConstraints] = useState<any[]>([]);
    const [hasFetched, setHasFetched] = useState(false);

    // Calculate how many shifts this employee has directly from the current un-saved state
    const shiftCount = assignments.filter((a: any) => a.employee_id === emp.id).length;

    // Fetch constraints from DB only when hovered for the first time
    useEffect(() => {
        if (isHovered && !hasFetched && weekDates && weekDates.length > 0) {
            const startDate = weekDates[0];
            const endDate = weekDates[weekDates.length - 1];
            
            getEmployeeConstraints(emp.id, startDate, endDate)
                .then(data => {
                    setConstraints(data);
                    setHasFetched(true);
                })
                .catch(err => console.error("Failed to fetch constraints:", err));
        }
    }, [isHovered, hasFetched, emp.id, weekDates]);
    
    // Calculate exact position when mouse enters
    const handleMouseEnter = (e: React.MouseEvent) => {
        // Get the exact bounding rectangle of the hovered element
        const rect = e.currentTarget.getBoundingClientRect();
        
        setPopupPos({
            top: rect.top, // Align with the top of the hovered button
            // window.innerWidth - rect.left gives us the distance from the right edge of the screen 
            // to the left edge of the element. Add 10px for a nice gap.
            right: window.innerWidth - rect.left + 10 
        });
        setIsHovered(true);
    };

    return (
        <div className="flex items-center gap-1 w-full relative">
            
            {/* 1. The Draggable Area */}
            <div 
                draggable 
                onDragStart={(e) => {
                    const payload = { type: 'FROM_SIDEBAR', employee_id: emp.id };
                    e.dataTransfer.setData('application/json', JSON.stringify(payload));
                }}
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

            {/* 2. Shift Count & Hover Grid */}
            <div 
                onMouseEnter={handleMouseEnter} // Use the new function
                onMouseLeave={() => setIsHovered(false)}
                className="relative h-9 w-9 flex items-center justify-center rounded border border-slate-200 bg-slate-50 shadow-sm shrink-0 cursor-help hover:bg-slate-100 transition"
            >
                <span className="text-sm font-bold text-slate-700">{shiftCount}</span>
                
                {/* The Weekly Popup Grid (Visible only on Hover) */}
                {isHovered && weekDates && weekDates.length > 0 && (
                    <div 
                        // Use 'fixed' to escape clipping, but apply dynamic inline styles for exact positioning!
                        className="fixed bg-white border border-slate-300 shadow-2xl rounded-lg p-2 z-[9999] w-[240px] cursor-default" 
                        style={{ top: `${popupPos.top}px`, right: `${popupPos.right}px` }}
                        dir="rtl"
                    >
                        <div className="text-xs font-bold text-slate-700 mb-2 border-b pb-1">
                            לו"ז שבועי: {emp.name}
                        </div>
                        <table className="w-full text-center border-collapse">
                            <thead>
                                <tr>
                                    <th className="border border-slate-200 p-1 text-[10px] bg-slate-50 w-12">משמרת</th>
                                    {weekDates.map((date: string) => {
                                        const dayName = new Date(date).toLocaleDateString('he-IL', { weekday: 'narrow' });
                                        return <th key={`head-${date}`} className="border border-slate-200 p-1 text-[10px] bg-slate-50">{dayName}'</th>
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {shifts.map((shift: any) => (
                                    <tr key={`row-${shift.id}`}>
                                        <td className="border border-slate-200 p-1 text-[10px] font-semibold bg-slate-50">{shift.name}</td>
                                        {weekDates.map((date: string) => {
                                            const isAssigned = assignments.some((a: any) => a.employee_id === emp.id && a.date === date && a.shift_id === shift.id);
                                            const hasConstraint = constraints.some((c: any) => c.date === date && c.shift_id === shift.id && c.constraint_type === 'CANNOT_WORK');
                                            
                                            return (
                                                <td 
                                                    key={`cell-${date}-${shift.id}`} 
                                                    className={`border border-slate-200 p-1 text-[10px] h-6 ${hasConstraint ? 'bg-red-100' : 'bg-white'}`}
                                                >
                                                    {isAssigned && <Check size={12} strokeWidth={3} className="mx-auto text-slate-800" />}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 3. The Edit Button */}
            <button
                onClick={() => onEdit(emp.id)}
                className="h-9 w-9 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition shadow-sm shrink-0"
                title={`Edit ${emp.name}`}
            >
                <Edit size={14} />
            </button>

        </div>
    );
}