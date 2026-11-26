// src/features/employees/EmployeesTable.tsx
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarX, Trash2 } from 'lucide-react';

import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';
import type { Employee, Position } from '@/types';
import { toCssColor } from '@/lib/color';
import PositionBadge from '@/features/positions/PositionBadge';
import type { SortDir, SortKey } from './hooks/useEmployeeSort';

interface EmployeesTableProps {
    // Already sorted
    employees: Employee[];
    // Every role of the location, archived included (labels for the roles column)
    positionsById: Record<number, Position>;
    sortKey: SortKey;
    sortDir: SortDir;
    onSort: (key: SortKey) => void;
    onEdit: (emp: Employee) => void;
    onEditConstraints: (emp: Employee) => void;
    onDelete: (emp: Employee) => void;
    // The row whose delete is in flight
    deletingId: number | null;
}

export default function EmployeesTable({
    employees,
    positionsById,
    sortKey,
    sortDir,
    onSort,
    onEdit,
    onEditConstraints,
    onDelete,
    deletingId,
}: EmployeesTableProps) {
    const renderSortIcon = (key: SortKey) => {
        if (sortKey !== key) return <ArrowUpDown size={14} className="text-slate-400" />;
        return sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
    };

    const sortHeader = (key: SortKey, label: string) => (
        <th className="px-6 py-3 font-semibold text-sm text-start">
            <button
                type="button"
                onClick={() => onSort(key)}
                className="flex items-center gap-1 hover:text-slate-900 transition"
            >
                {label}
                {renderSortIcon(key)}
            </button>
        </th>
    );

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-start">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                        {sortHeader('id', 'מזהה')}
                        {sortHeader('name', 'שם')}
                        <th className="px-6 py-3 font-semibold text-sm text-start">צבע</th>
                        <th className="px-6 py-3 font-semibold text-sm text-start">תפקידים</th>
                        <th className="px-6 py-3 font-semibold text-sm text-start">סטטוס</th>
                        <th className="px-6 py-3 font-semibold text-sm text-start">פעולות</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {employees.map((emp) => (
                        <tr key={emp.id} className="hover:bg-slate-50 transition">
                            <td className="px-6 py-4 text-slate-600">#{emp.id}</td>
                            <td className="px-6 py-4 font-medium text-slate-900">{emp.user?.first_name} {emp.user?.last_name}</td>
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-4 h-4 rounded-full border border-slate-300"
                                        style={{ backgroundColor: toCssColor(emp.color) }}
                                    />
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1">
                                    {emp.position_ids
                                        .map(id => positionsById[id])
                                        .filter(position => position !== undefined)
                                        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
                                        .map(position => (
                                            <PositionBadge
                                                key={position.id}
                                                position={position}
                                                isPrimary={position.id === emp.primary_position_id}
                                            />
                                        ))}
                                    {!emp.position_ids.some(id => positionsById[id]?.is_active) && (
                                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                                            ללא תפקיד
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                                    emp.is_active
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                }`}>
                                    {emp.is_active ? 'פעיל' : 'לא פעיל'}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                    <Button variant="soft" size="sm" onClick={() => onEdit(emp)}>
                                        עריכה
                                    </Button>

                                    {/* Orange marks constraints across the app */}
                                    <Button
                                        variant="soft"
                                        size="sm"
                                        onClick={() => onEditConstraints(emp)}
                                        className="gap-1 bg-orange-50 text-orange-600 hover:bg-orange-100 hover:text-orange-800"
                                    >
                                        <CalendarX size={16} />
                                        אילוצים
                                    </Button>

                                    <IconButton
                                        tone="danger"
                                        label="מחק עובד"
                                        onClick={() => onDelete(emp)}
                                        disabled={deletingId === emp.id}
                                    >
                                        <Trash2 size={18} />
                                    </IconButton>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
