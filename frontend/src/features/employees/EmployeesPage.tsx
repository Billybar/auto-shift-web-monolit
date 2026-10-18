// src/features/employees/EmployeesPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import EmployeeModal from './EmployeeModal';
import { getEmployeesByLocation, deleteEmployee} from '../../api/employees';
import { logError, toAppError } from '../../api/errors';
import type { AppError } from '../../api/errors';
import { notify } from '../../lib/notify';
import WeeklyConstraintsBoard from '../constraints/WeeklyConstraintsBoard';
import type { Employee,} from '../../types';
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarX, Trash2 } from 'lucide-react'; // for icons
import { useAppLocation } from '../../context/LocationContext';
import { UserRole } from '../../types/index';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/confirmContext';
import InlineAlert from '../../components/ui/InlineAlert';
import { UserRoundPlus } from 'lucide-react';

type SortKey = 'id' | 'name';
type SortDir = 'asc' | 'desc';

const getFullName = (emp: Employee): string =>
    `${emp.user?.first_name ?? ''} ${emp.user?.last_name ?? ''}`.trim();

export default function EmployeesPage() {
    // --location state
    const { selectedLocationId } = useAppLocation();

    // --- Auth State ---
    const { user } = useAuth();
    const isDispatcher = user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER || user?.role === UserRole.SCHEDULER;

    const confirm = useConfirm();

    // --- Data State ---
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<AppError | null>(null);

    // --- Modal & Form State ---
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    // Keep a reference to the full employee object, not just the ID
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);


    // --- Constraints Modal State ---
    const [isConstraintsModalOpen, setIsConstraintsModalOpen] = useState<boolean>(false);
    const [selectedEmpForConstraints, setSelectedEmpForConstraints] = useState<Employee | null>(null);

    // --- Delete State --- (the row's delete button is disabled while its request is in flight)
    const [deletingId, setDeletingId] = useState<number | null>(null);

    // --- Sort State ---
    const [sortKey, setSortKey] = useState<SortKey>('id');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    /**
     * Active employees always come first; the chosen column sorts within each group.
     */
    const sortedEmployees = useMemo(() => {
        const dir = sortDir === 'asc' ? 1 : -1;
        return [...employees].sort((a, b) => {
            if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
            if (sortKey === 'name') {
                const byName = getFullName(a).localeCompare(getFullName(b), 'he');
                if (byName !== 0) return byName * dir;
            }
            return (a.id - b.id) * dir;
        });
    }, [employees, sortKey, sortDir]);

    /**
     * Clicking the active column flips the direction; clicking another column sorts it ascending
     */
    const handleSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const renderSortIcon = (key: SortKey) => {
        if (sortKey !== key) return <ArrowUpDown size={14} className="text-gray-400" />;
        return sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
    };

    // Fetch data when the component mounts
    const fetchEmployees = async () => {
        // Do not fetch if no location is selected
        if (!selectedLocationId) return;

        try {
            setLoading(true);
            // Call the API function we created
            const data = await getEmployeesByLocation(selectedLocationId);
            setEmployees(data);
            setError(null);
        } catch (err) {
            logError("Failed to fetch employees:", err);
            setError(toAppError(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEmployees();
    }, [selectedLocationId]);

    /**
     * Opens the modal in "Create" mode
     */
    const handleOpenCreate = () => {
        setSelectedEmployee(null); // null means create mode
        setIsModalOpen(true);
    };

    /**
     * Opens the modal in "Edit" mode and populates the form with existing data
     */
    const handleOpenEdit = (emp: Employee) => {
        setSelectedEmployee(emp); // pass the entire object to the modal
        setIsModalOpen(true);
    };

    const handleOpenConstraints = (emp: Employee) => {
        setSelectedEmpForConstraints(emp);
        setIsConstraintsModalOpen(true);
    };

    /**
     * Asks for confirmation, then deletes the employee and refreshes the list
     */
    const handleDelete = async (emp: Employee) => {
        const confirmed = await confirm({
            title: 'למחוק את העובד?',
            // The backend cascades the delete to the employee's user, settings, assignments, constraints and notes
            description: `המחיקה של ${getFullName(emp)} סופית: יימחקו גם חשבון המשתמש, המשמרות, האילוצים וההערות של העובד. לא ניתן לבטל פעולה זו.`,
            confirmText: 'מחיקה',
            tone: 'danger',
        });
        if (!confirmed) return;

        try {
            setDeletingId(emp.id);
            await deleteEmployee(emp.id);
            notify.success('העובד נמחק');
            fetchEmployees();
        } catch (err) {
            notify.error(err, 'מחיקת העובד נכשלה');
        } finally {
            setDeletingId(null);
        }
    };

    // Render protection state if no location is selected
    if (!selectedLocationId) {
        return (
            <div className="flex justify-center items-center h-full flex-col gap-4 text-slate-500">
                <h2 className="text-xl font-medium">בחר אתר בתפריט העליון כדי לראות את העובדים</h2>
            </div>
        );
    }

    // Render loading state
    if (loading && employees.length === 0) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    // Render error state
    if (error) {
        return (
            <InlineAlert variant="error" title="טעינת רשימת העובדים נכשלה" action={{ label: 'נסה שוב', onClick: fetchEmployees }}>
                {error.message}
            </InlineAlert>
        );
    }

    // Render the data table
    return (
        <div className="relative h-full">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                    <button 
                        onClick={handleOpenCreate}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-sm active:scale-95"
                        >
                        <UserRoundPlus size={18} />
                        <span>הוספת עובד</span>
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-start">
                        <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 font-semibold text-sm text-start">
                                    <button
                                        type="button"
                                        onClick={() => handleSort('id')}
                                        className="flex items-center gap-1 hover:text-gray-900 transition"
                                    >
                                        מזהה
                                        {renderSortIcon('id')}
                                    </button>
                                </th>
                                <th className="px-6 py-3 font-semibold text-sm text-start">
                                    <button
                                        type="button"
                                        onClick={() => handleSort('name')}
                                        className="flex items-center gap-1 hover:text-gray-900 transition"
                                    >
                                        שם
                                        {renderSortIcon('name')}
                                    </button>
                                </th>
                                <th className="px-6 py-3 font-semibold text-sm text-start">צבע</th>
                                <th className="px-6 py-3 font-semibold text-sm text-start">סטטוס</th>
                                <th className="px-6 py-3 font-semibold text-sm text-start">פעולות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {sortedEmployees.map((emp) => (
                                <tr key={emp.id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4 text-gray-600">#{emp.id}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{emp.user?.first_name} {emp.user?.last_name}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div 
                                                className="w-4 h-4 rounded-full border border-gray-300" 
                                                style={{ backgroundColor: emp.color.startsWith('#') ? emp.color : `#${emp.color}` }}
                                            />
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
                                            <button
                                                onClick={() => handleOpenEdit(emp)}
                                                className="text-blue-600 hover:text-blue-800 font-medium px-3 py-1 bg-blue-50 hover:bg-blue-100 rounded transition"
                                            >
                                                עריכה
                                            </button>

                                            <button
                                                onClick={() => handleOpenConstraints(emp)}
                                                className="flex items-center gap-1 text-orange-600 hover:text-orange-800 font-medium px-3 py-1 bg-orange-50 hover:bg-orange-100 rounded transition"
                                            >
                                                <CalendarX size={16} />
                                                אילוצים
                                            </button>

                                            <button
                                                onClick={() => handleDelete(emp)}
                                                disabled={deletingId === emp.id}
                                                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="מחק עובד"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Reusable Employee Modal */}
            <EmployeeModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                employee={selectedEmployee}
                locationId={selectedLocationId}
                onSuccess={fetchEmployees} // Refreshes the table upon save
            />

            {/* Constraints Modal Overlay using the new WeeklyConstraintsBoard */}
            {isConstraintsModalOpen && selectedEmpForConstraints && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 transition-opacity">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] p-1 overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-y-auto p-5">
                            <WeeklyConstraintsBoard 
                                employeeId={selectedEmpForConstraints.id}
                                employeeName={`${selectedEmpForConstraints.user?.first_name ?? ''} ${selectedEmpForConstraints.user?.last_name ?? ''}`.trim()}
                                isManager={isDispatcher}
                                onCancel={() => setIsConstraintsModalOpen(false)}
                                onSaveSuccess={() => setIsConstraintsModalOpen(false)}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}