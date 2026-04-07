// src/features/employees/EmployeesPage.tsx
import React, { useEffect, useState } from 'react';
import EmployeeModal from './EmployeeModal';
import { getEmployeesByLocation, createEmployee, updateEmployee, updateEmployeeSettings, deleteEmployee} from '../../api/employees';
import WeeklyConstraintsBoard from '../constraints/WeeklyConstraintsBoard';
import type { Employee, EmployeeCreate, EmployeeSettingsUpdate } from '../../types';
import { CalendarX, Trash2 } from 'lucide-react'; // for icons
import { useAppLocation } from '../../context/LocationContext';
import { UserRole } from '../../types/index';
import { useAuth } from '../../context/AuthContext';
import ConfirmModal from '../../components/ui/ConfirmModal';


export default function EmployeesPage() {
    // --location state
    const { selectedLocationId } = useAppLocation();

    // --- Auth State ---
    const { user } = useAuth();
    const isDispatcher = user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER || user?.role === UserRole.SCHEDULER;

    // --- Data State ---
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // --- Modal & Form State ---
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    // Keep a reference to the full employee object, not just the ID
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);


    // --- Constraints Modal State ---
    const [isConstraintsModalOpen, setIsConstraintsModalOpen] = useState<boolean>(false);
    const [selectedEmpForConstraints, setSelectedEmpForConstraints] = useState<Employee | null>(null);

    // --- Delete Modal State ---
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
    const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

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
            console.error("Failed to fetch employees:", err);
            setError("Failed to load employees. Please check if the backend is running.");
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
     * Opens the delete confirmation modal for a specific employee
     */
    const handleOpenDelete = (emp: Employee) => {
        setEmployeeToDelete(emp);
        setIsDeleteModalOpen(true);
    };

    /**
     * Executes the API call to delete the employee and refreshes the list
     */
    const handleConfirmDelete = async () => {
        if (!employeeToDelete) return;
        
        try {
            setIsDeleting(true);
            await deleteEmployee(employeeToDelete.id);
            
            // Close modal, clear state, and refresh table
            setIsDeleteModalOpen(false);
            setEmployeeToDelete(null);
            fetchEmployees(); 
            
        } catch (err) {
            console.error("Failed to delete employee:", err);
            alert("Failed to delete employee. They might be linked to existing shifts.");
        } finally {
            setIsDeleting(false);
        }
    };

    // Render protection state if no location is selected
    if (!selectedLocationId) {
        return (
            <div className="flex justify-center items-center h-full flex-col gap-4 text-slate-500">
                <h2 className="text-xl font-medium">Please select a location from the top menu to view employees</h2>
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
                                            {emp.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
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
                                            onClick={() => handleOpenDelete(emp)}
                                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition"
                                            title="Delete Employee"
                                        >
                                            <Trash2 size={18} />
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
                locationId={selectedLocationId}
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
                                isManager={isDispatcher}
                                onCancel={() => setIsConstraintsModalOpen(false)}
                                onSaveSuccess={() => setIsConstraintsModalOpen(false)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmModal 
                isOpen={isDeleteModalOpen}
                title="Delete Employee"
                message={`Are you sure you want to permanently delete ${employeeToDelete?.user?.first_name} ${employeeToDelete?.user?.last_name}? This action cannot be undone.`}
                confirmText="Delete"
                isProcessing={isDeleting}
                onConfirm={handleConfirmDelete}
                onCancel={() => setIsDeleteModalOpen(false)}
            />
        </div>
    );
}