import { useState } from 'react';
import { Search } from 'lucide-react';
import type { Assignment, Employee, Position, ShiftDefinition } from '../../types';
import EmployeeSidebarRow from './EmployeeSidebarRow';

// Role filter: every employee, one role's holders, or employees with no active role
type RoleFilter = 'all' | 'none' | number;

interface EmployeeSidebarProps {
    employeesMap: Record<number, Employee>;
    // All roles of the location, archived included
    positions: Position[];
    assignments: Assignment[];
    searchQuery: string;
    onSearchChange: (val: string) => void;
    onEditEmployee: (empId: number) => void;
    shifts: ShiftDefinition[];
    weekDates: string[];
}

export default function EmployeeSidebar({
    employeesMap,
    positions,
    assignments,
    searchQuery,
    onSearchChange,
    onEditEmployee,
    shifts,
    weekDates
}: EmployeeSidebarProps) {
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
    const activePositions = positions.filter(p => p.is_active);
    const activeIds = new Set(activePositions.map(p => p.id));

    // Filter logic moved here! Keeps the main page cleaner.
    const filteredSidebarEmployees = Object.values(employeesMap).filter(emp => {
        if (!emp.is_active) return false;
        const heldActive = emp.position_ids.filter(id => activeIds.has(id));
        if (roleFilter === 'none' && heldActive.length > 0) return false;
        if (typeof roleFilter === 'number' && !heldActive.includes(roleFilter)) return false;
        if (searchQuery.trim() === '') return true;
        const empName = emp.user ? `${emp.user.first_name} ${emp.user.last_name}` : '';
        return empName.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <div className="w-56 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden shrink-0">
            {/* Sidebar Header & Search */}
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-700 text-sm">עובדים</h3>
                    <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                        {filteredSidebarEmployees.length}
                    </span>
                </div>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                        <Search size={14} className="text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="חפש עובד..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full pl-8 pr-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>
                {/* The role filter only matters when there is more than one role */}
                {activePositions.length > 1 && (
                    <select
                        value={String(roleFilter)}
                        onChange={(e) => {
                            const value = e.target.value;
                            setRoleFilter(value === 'all' || value === 'none' ? value : Number(value));
                        }}
                        aria-label="סינון לפי תפקיד"
                        className="w-full py-1.5 px-2 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                        <option value="all">כל התפקידים</option>
                        {activePositions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        <option value="none">ללא תפקיד</option>
                    </select>
                )}
            </div>

            {/* Draggable Filtered Employee List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredSidebarEmployees.map(emp => (
                    <EmployeeSidebarRow
                        key={`sidebar-emp-${emp.id}`}
                        emp={emp}
                        positions={activePositions}
                        showPositions={activePositions.length > 1}
                        assignments={assignments}
                        onEdit={onEditEmployee}
                        shifts={shifts}
                        weekDates={weekDates}
                    />
                ))}
            </div>
        </div>
    );
}
