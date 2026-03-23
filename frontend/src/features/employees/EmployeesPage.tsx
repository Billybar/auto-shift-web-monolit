// src/features/employees/EmployeesPage.tsx
import React, { useEffect, useState } from 'react';
import EmployeeModal from './EmployeeModal';
import { getEmployeesByLocation, createEmployee, updateEmployee, updateEmployeeSettings} from '../../api/employees';
import WeeklyConstraintsBoard from '../constraints/WeeklyConstraintsBoard';
import type { Employee, EmployeeCreate, EmployeeSettingsUpdate } from '../../types';
import { CalendarX } from 'lucide-react'; // for icons


export default function EmployeesPage() {
    // --- Auth State ---
    // TODO: Replace this hardcoded value with your actual global auth hook.
    // Example: const { user } = useAuth(); const isManager = user?.role === 'manager';
    const isManager: boolean = true;

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

    const handleOpenConstraints = (emp: Employee) => {
        setSelectedEmpForConstraints(emp);
        setIsConstraintsModalOpen(true);
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

            {/* Constraints Modal Overlay using the new WeeklyConstraintsBoard */}
            {isConstraintsModalOpen && selectedEmpForConstraints && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 transition-opacity">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] p-1 overflow-hidden flex flex-col">
                        <div className="flex-1 overflow-hidden p-5">
                            <WeeklyConstraintsBoard 
                                employeeId={selectedEmpForConstraints.id}
                                employeeName={selectedEmpForConstraints.name}
                                isManager={isManager}
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