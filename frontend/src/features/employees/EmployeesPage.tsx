// src/features/employees/EmployeesPage.tsx
import React, { useEffect, useState } from 'react';
import EmployeeModal from './EmployeeModal';
import { getEmployeesByLocation, createEmployee, updateEmployee, updateEmployeeSettings} from '../../api/employees';
import { getEmployeeConstraints, syncEmployeeConstraints } from '../../api/constrains';
import type { Employee, EmployeeCreate, EmployeeSettingsUpdate, WeeklyConstraintCreate } from '../../types';
import { CalendarX } from 'lucide-react'; // אייקון לאילוצים

export default function EmployeesPage() {
    // --- Data State ---
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // --- Modal & Form State ---
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    // Keep a reference to the full employee object, not just the ID
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // אם הערך הוא null, אנחנו במצב "יצירה". אם יש לו ערך, אנחנו במצב "עריכה".
    const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);


    // --- Constraints Modal State ---
    const [isConstraintsModalOpen, setIsConstraintsModalOpen] = useState<boolean>(false);
    const [selectedEmpForConstraints, setSelectedEmpForConstraints] = useState<Employee | null>(null);
    const [constraintsList, setConstraintsList] = useState<WeeklyConstraintCreate[]>([]);
    
    // ניהול טופס הוספת אילוץ מקומי
    const [constDate, setConstDate] = useState<string>('');
    const [constShift, setConstShift] = useState<number>(1); // נניח: 1=בוקר, 2=ערב, 3=לילה
    const [constType, setConstType] = useState<string>('CANNOT_WORK');
    
    // טווח סנכרון (נבחר שבוע דיפולטיבי בשביל ה-MVP)
    const [syncStartDate, setSyncStartDate] = useState<string>('2024-06-02');
    const [syncEndDate, setSyncEndDate] = useState<string>('2024-06-08');

    // Hardcoded location ID for now (will be replaced by Global State later)
    const CURRENT_LOCATION_ID = 3;

    // Fetch data when the component mounts
    const fetchEmployees = async () => {
        try {
            setLoading(true);
            // Call the API function we created
            const data = await getEmployeesByLocation(CURRENT_LOCATION_ID);
            setEmployees(data);
            setError(null);
        } catch (err) {
            console.error("Failed to fetch employees:", err);
            setError("Failed to load employees. Please check if the backend is running.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEmployees();
    }, []);

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

    const handleOpenConstraints = async (emp: Employee) => {
        setSelectedEmpForConstraints(emp);
        setConstraintsList([]); // reset memory
        setIsConstraintsModalOpen(true);
        
        try {
            // reload exiting constrains fromo DB
            const existing = await getEmployeeConstraints(emp.id, syncStartDate, syncEndDate);
            // המרה לטייפ של יצירה כדי שנוכל לערוך ולשלוח שוב
            const mapped = existing.map(c => ({
                employee_id: c.employee_id,
                shift_id: c.shift_id,
                date: c.date,
                constraint_type: c.constraint_type
            }));
            setConstraintsList(mapped);
        } catch (err) {
            console.error("Failed to fetch constraints", err);
        }
    };

    // --- Constraints Table Helpers ---
    
    /**
     * Creates an array of 7 formatted date strings starting from syncStartDate.
     */
    const getWeekDays = () => {
        if (!syncStartDate) return [];
        const days = [];
        let currentDate = new Date(syncStartDate);
        for (let i = 0; i < 7; i++) {
            days.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return days;
    };

    const SHIFT_TYPES = [
        { id: 7, name: 'בוקר' },
        { id: 8, name: 'ערב' },
        { id: 9, name: 'לילה' }
    ];

    /**
     * Toggles the constraint status of a specific cell when clicked.
     * State cycle: Empty -> CANNOT_WORK -> MUST_WORK -> Empty
     */
    const handleToggleCell = (date: string, shiftId: number) => {
        if (!selectedEmpForConstraints) return;

        const existingIndex = constraintsList.findIndex(c => c.date === date && c.shift_id === shiftId);
        
        if (existingIndex >= 0) {
            const existing = constraintsList[existingIndex];
            const updated = [...constraintsList];
            
            if (existing.constraint_type === 'cannot_work') {
                // Step 2: Change to 'must_work'
                updated[existingIndex].constraint_type = 'must_work';
                setConstraintsList(updated);
            } else {
                // Step 3: Remove constraint (Back to empty/available)
                updated.splice(existingIndex, 1);
                setConstraintsList(updated);
            }
        } else {
            // Step 1: Add new CANNOT_WORK constraint
            const newConstraint: WeeklyConstraintCreate = {
                employee_id: selectedEmpForConstraints.id,
                shift_id: shiftId,
                date: date,
                constraint_type: 'cannot_work'
            };
            setConstraintsList([...constraintsList, newConstraint]);
        }
    };

    /**
     * Determines the visual styling and text label for a specific cell.
     */
    const getCellDisplay = (date: string, shiftId: number) => {
        const constraint = constraintsList.find(c => c.date === date && c.shift_id === shiftId);
        
        // Default state (No constraint)
        if (!constraint) return { label: 'פנוי', classes: 'bg-white text-gray-400 hover:bg-gray-100' };
        
        // Cannot work state
        if (constraint.constraint_type === 'CANNOT_WORK') {
            return { label: 'X לא יכול', classes: 'bg-red-100 text-red-700 border-red-300 font-bold' };
        }
        
        // Must work state
        return { label: 'V חייב', classes: 'bg-green-100 text-green-700 border-green-300 font-bold' };
    };

    const handleSyncConstraints = async () => {
        if (!selectedEmpForConstraints) return;
        try {
            setIsSubmitting(true);
            await syncEmployeeConstraints(
                selectedEmpForConstraints.id, 
                syncStartDate, 
                syncEndDate, 
                constraintsList
            );
            setIsConstraintsModalOpen(false);
            alert('Constraints synced successfully!');
        } catch (err: any) {
            console.error("Failed to sync constraints", err);
            const backendMsg = err.response?.data?.detail || "תקלת תקשורת מול השרת.";
            alert(`שגיאה בשמירה: ${backendMsg}`);
        } finally {
            setIsSubmitting(false);
        }
    };

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
            <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200">
                {error}
            </div>
        );
    }

    // Render the data table
    return (
        <div className="relative h-full">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-800">Employee Management</h3>
                    <button 
                        onClick={handleOpenCreate}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition"
                    >
                        + Add Employee
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 font-semibold text-sm">ID</th>
                                <th className="px-6 py-3 font-semibold text-sm">Name</th>
                                <th className="px-6 py-3 font-semibold text-sm">Color</th>
                                <th className="px-6 py-3 font-semibold text-sm">Status</th>
                                <th className="px-6 py-3 font-semibold text-sm text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {employees.map((emp) => (
                                <tr key={emp.id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4 text-gray-600">#{emp.id}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{emp.name}</td>
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
                                            {emp.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => handleOpenEdit(emp)}
                                            className="text-blue-600 hover:text-blue-800 font-medium px-3 py-1 bg-blue-50 hover:bg-blue-100 rounded transition"
                                        >
                                            Edit
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                                        <button 
                                            onClick={() => handleOpenConstraints(emp)}
                                            className="flex items-center gap-1 text-orange-600 hover:text-orange-800 font-medium px-3 py-1 bg-orange-50 hover:bg-orange-100 rounded transition"
                                        >
                                            <CalendarX size={16} />
                                            Constraints
                                        </button>
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
                locationId={CURRENT_LOCATION_ID}
                onSuccess={fetchEmployees} // Refreshes the table upon save
            />

            {/* Constraints Modal Overlay */}
            {isConstraintsModalOpen && selectedEmpForConstraints && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-5xl p-6 max-h-[95vh] overflow-y-auto" dir="rtl">
                        
                        {/* Modal Header */}
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-800">הגשת אילוצים: {selectedEmpForConstraints.name}</h2>
                                <p className="text-sm text-gray-500">לחץ על תא כדי לשנות: פנוי ➔ לא יכול ➔ מעדיף/חייב</p>
                            </div>
                            
                            {/* Week Selection */}
                            <div className="flex items-end gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">תאריך תחילת שבוע</label>
                                    <input 
                                        type="date" 
                                        value={syncStartDate} 
                                        onChange={(e) => {
                                            setSyncStartDate(e.target.value);
                                            // Auto-calculate the end date (6 days ahead)
                                            const start = new Date(e.target.value);
                                            start.setDate(start.getDate() + 6);
                                            setSyncEndDate(start.toISOString().split('T')[0]);
                                            
                                            // reset constarins table
                                            setConstraintsList([]);
                                        }} 
                                        className="border border-gray-300 rounded p-1.5 text-sm" 
                                    />
                                </div>
                                <button 
                                    onClick={() => handleOpenConstraints(selectedEmpForConstraints)} 
                                    className="bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1.5 rounded text-sm font-medium transition"
                                >
                                    טען שבוע
                                </button>
                            </div>
                        </div>

                        {/* 2D Constraints Grid */}
                        <div className="border border-gray-300 rounded-xl overflow-hidden mb-6 bg-white shadow-sm">
                            <table className="w-full text-center table-fixed border-collapse">
                                <thead className="bg-slate-800 text-white">
                                    <tr>
                                        <th className="w-24 p-3 border border-slate-700 font-semibold">משמרת</th>
                                        {getWeekDays().map((date) => {
                                            const dayName = new Date(date).toLocaleDateString('he-IL', { weekday: 'long' });
                                            return (
                                                <th key={date} className="p-2 border border-slate-700 font-medium">
                                                    <div className="text-sm">{dayName}</div>
                                                    <div className="text-xs text-slate-300">{date.split('-').reverse().join('/')}</div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {SHIFT_TYPES.map((shift) => (
                                        <tr key={shift.id}>
                                            {/* Column 1: Shift Name */}
                                            <td className="p-3 bg-slate-100 font-bold text-slate-700 border border-gray-300">
                                                {shift.name}
                                            </td>
                                            
                                            {/* Columns 2-8: Interactive Cells */}
                                            {getWeekDays().map((date) => {
                                                const cellData = getCellDisplay(date, shift.id);
                                                return (
                                                    <td key={`${date}-${shift.id}`} className="border border-gray-300 p-1 bg-gray-50">
                                                        <button 
                                                            onClick={() => handleToggleCell(date, shift.id)}
                                                            className={`w-full h-16 rounded flex items-center justify-center transition border border-transparent select-none cursor-pointer ${cellData.classes}`}
                                                        >
                                                            {cellData.label}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Bottom Action Buttons */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                            <button 
                                onClick={() => setIsConstraintsModalOpen(false)} 
                                className="px-5 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition font-medium"
                            >
                                ביטול
                            </button>
                            <button 
                                onClick={handleSyncConstraints} 
                                disabled={isSubmitting} 
                                className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 font-medium flex items-center gap-2"
                            >
                                {isSubmitting ? 'Saving...' : 'שמור אילוצים (Sync)'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}