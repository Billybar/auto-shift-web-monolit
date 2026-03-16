import React from 'react';
import { Search } from 'lucide-react';
import EmployeeSidebarRow from './EmployeeSidebarRow';

interface EmployeeSidebarProps {
    employeesMap: Record<number, any>;
    assignments: any[];
    searchQuery: string;
    onSearchChange: (val: string) => void;
    onEditEmployee: (empId: number) => void;
    shifts: any[];
    weekDates: string[];
}

export default function EmployeeSidebar({
    employeesMap,
    assignments,
    searchQuery,
    onSearchChange,
    onEditEmployee,
    shifts,
    weekDates
}: EmployeeSidebarProps) {
    
    // Filter logic moved here! Keeps the main page cleaner.
    const filteredSidebarEmployees = Object.values(employeesMap).filter((emp: any) => {
        if (!emp.is_active) return false;
        if (searchQuery.trim() === '') return true;
        return emp.name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <div className="w-64 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden shrink-0">
            {/* Sidebar Header & Search */}
            <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-700 text-sm">Employees</h3>
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
                        placeholder="Search employee..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full pl-8 pr-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>
            </div>
            
            {/* Draggable Filtered Employee List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filteredSidebarEmployees.map((emp: any) => (
                    <EmployeeSidebarRow 
                        key={`sidebar-emp-${emp.id}`}
                        emp={emp}
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