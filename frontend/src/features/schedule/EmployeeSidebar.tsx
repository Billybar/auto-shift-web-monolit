import { useState } from 'react';
import { Search, Tags } from 'lucide-react';
import IconButton from '@/components/ui/IconButton';
import { Input, Select } from '@/components/ui/Input';
import { useStoredFlag } from '@/hooks/useStoredFlag';
import type { Assignment, Employee, Position, ShiftDefinition } from '@/types';
import EmployeeSidebarRow from './EmployeeSidebarRow';

// The role badges under each employee can be hidden; the choice stays in this browser
const SHOW_BADGES_KEY = 'schedule.sidebar.showPositions';

// Role filter: every employee, one role's holders, or employees with no active role
type RoleFilter = 'all' | 'none' | number;

interface EmployeeSidebarProps {
    employeesMap: Record<number, Employee>;
    // Compact name per employee id (first name, plus last-name letters when first names clash)
    employeeLabels: Map<number, string>;
    // All roles of the location, archived included
    positions: Position[];
    assignments: Assignment[];
    searchQuery: string;
    onSearchChange: (val: string) => void;
    onEditEmployee: (empId: number) => void;
    onEditConstraints: (empId: number) => void;
    shifts: ShiftDefinition[];
    weekDates: string[];
    // Employees who haven't submitted constraints for the week (their week shows their defaults)
    pendingConstraintIds: ReadonlySet<number>;
}

export default function EmployeeSidebar({
    employeesMap,
    employeeLabels,
    positions,
    assignments,
    searchQuery,
    onSearchChange,
    onEditEmployee,
    onEditConstraints,
    shifts,
    weekDates,
    pendingConstraintIds
}: EmployeeSidebarProps) {
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
    const activePositions = positions.filter(p => p.is_active);
    const activeIds = new Set(activePositions.map(p => p.id));
    // Badges, their toggle and the role filter only matter when there is more than one role
    const hasRoles = activePositions.length > 1;
    const [showBadges, setShowBadges] = useStoredFlag(SHOW_BADGES_KEY, true);

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
        // Narrower below 2xl (1536px) so laptop widths leave the grid more room
        <div className="w-44 2xl:w-56 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden shrink-0">
            {/* Sidebar Header & Search */}
            <div className="p-2 2xl:p-3 border-b border-slate-200 bg-slate-50 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-700 text-sm">עובדים</h3>
                    <div className="flex items-center gap-1">
                        {hasRoles && (
                            <IconButton
                                label={showBadges ? 'הסתרת תפקידים' : 'הצגת תפקידים'}
                                aria-pressed={showBadges}
                                tone={showBadges ? 'primary' : 'neutral'}
                                size="sm"
                                onClick={() => setShowBadges(!showBadges)}
                            >
                                <Tags size={14} />
                            </IconButton>
                        )}
                        <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                            {filteredSidebarEmployees.length}
                        </span>
                    </div>
                </div>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                        <Search size={14} className="text-slate-400" />
                    </div>
                    <Input
                        type="search"
                        placeholder="חפש עובד..."
                        aria-label="חיפוש עובד"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="py-1.5 pl-8 pr-2 focus:ring-1"
                    />
                </div>
                {hasRoles && (
                    <Select
                        value={String(roleFilter)}
                        onChange={(e) => {
                            const value = e.target.value;
                            setRoleFilter(value === 'all' || value === 'none' ? value : Number(value));
                        }}
                        aria-label="סינון לפי תפקיד"
                        className="px-2 py-1.5 focus:ring-1"
                    >
                        <option value="all">כל התפקידים</option>
                        {activePositions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        <option value="none">ללא תפקיד</option>
                    </Select>
                )}
            </div>

            {/* Draggable Filtered Employee List */}
            <div className="flex-1 overflow-y-auto p-2 2xl:p-3 space-y-1.5">
                {filteredSidebarEmployees.map(emp => (
                    <EmployeeSidebarRow
                        key={`sidebar-emp-${emp.id}`}
                        emp={emp}
                        label={employeeLabels.get(emp.id)}
                        positions={activePositions}
                        showPositions={hasRoles && showBadges}
                        assignments={assignments}
                        onEdit={onEditEmployee}
                        onEditConstraints={onEditConstraints}
                        shifts={shifts}
                        weekDates={weekDates}
                        hasPendingConstraints={pendingConstraintIds.has(emp.id)}
                    />
                ))}
            </div>
        </div>
    );
}
