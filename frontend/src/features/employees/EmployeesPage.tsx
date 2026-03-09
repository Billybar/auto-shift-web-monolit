// src/features/employees/EmployeesPage.tsx
import React, { useEffect, useState } from 'react';
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
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // אם הערך הוא null, אנחנו במצב "יצירה". אם יש לו ערך, אנחנו במצב "עריכה".
    const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);

    // --- Form Fields ---
    const [newName, setNewName] = useState<string>('');
    const [newColor, setNewColor] = useState<string>('3B82F6');
    const [isActive, setIsActive] = useState<boolean>(true);

    // Settings Fields (For Edit Mode)
    const [minShifts, setMinShifts] = useState<number>(0);
    const [maxShifts, setMaxShifts] = useState<number>(6);
    const [maxNights, setMaxNights] = useState<number>(2);
    const [minNights, setMinNights] = useState<number>(0);
    const [maxMornings, setMaxMornings] = useState<number>(6);
    const [minMornings, setMinMornings] = useState<number>(0);
    const [maxEvenings, setMaxEvenings] = useState<number>(6);
    const [minEvenings, setMinEvenings] = useState<number>(0);

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
        setEditingEmployeeId(null);
        setNewName('');
        setNewColor('3B82F6');
        setIsActive(true);
        setIsModalOpen(true);
    };

    /**
     * Opens the modal in "Edit" mode and populates the form with existing data
     */
    const handleOpenEdit = (emp: Employee) => {
        setEditingEmployeeId(emp.id);
        setNewName(emp.name);
        setNewColor(emp.color);
        setIsActive(emp.is_active);
        
        // Populate settings if they exist
        if (emp.settings) {
            setMinShifts(emp.settings.min_shifts_per_week);
            setMaxShifts(emp.settings.max_shifts_per_week);
            setMaxNights(emp.settings.max_nights ?? 2);
            setMinNights(emp.settings.min_nights ?? 0);
            setMaxMornings(emp.settings.max_mornings ?? 6);
            setMinMornings(emp.settings.min_mornings ?? 0);
            setMaxEvenings(emp.settings.max_evenings ?? 6);
            setMinEvenings(emp.settings.min_evenings ?? 0);
        }
        
        setIsModalOpen(true);
    };

    /**
     * Handles both Create and Update submissions
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        try {
            setIsSubmitting(true);
            
            const employeePayload: EmployeeCreate = {
                name: newName,
                location_id: CURRENT_LOCATION_ID,
                color: newColor.replace('#', ''),
                is_active: isActive
            };

            if (editingEmployeeId) {
                // --- EDIT MODE ---
                await updateEmployee(editingEmployeeId, employeePayload);
                
                // Update settings as well
                const settingsPayload: EmployeeSettingsUpdate = {
                    min_shifts_per_week: minShifts,
                    max_shifts_per_week: maxShifts,
                    max_nights: maxNights,
                    min_nights: minNights,
                    max_mornings: maxMornings,
                    min_mornings: minMornings,
                    max_evenings: maxEvenings,
                    min_evenings: minEvenings,
                };
                await updateEmployeeSettings(editingEmployeeId, settingsPayload);
                
            } else {
                // --- CREATE MODE ---
                // Here we only create the employee. 
                // Settings will be updated later when the user clicks 'Edit'.
                await createEmployee(employeePayload);
            }
            
            await fetchEmployees();
            setIsModalOpen(false);
            
        } catch (err) {
            console.error("Operation failed:", err);
            alert("Action failed. See console for details.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenConstraints = async (emp: Employee) => {
        setSelectedEmpForConstraints(emp);
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

    const handleAddConstraintToList = () => {
        if (!constDate || !selectedEmpForConstraints) return;
        
        const newConstraint: WeeklyConstraintCreate = {
            employee_id: selectedEmpForConstraints.id,
            shift_id: constShift,
            date: constDate,
            constraint_type: constType
        };
        
        setConstraintsList([...constraintsList, newConstraint]);
        setConstDate(''); // reset date after adding
    };

    const handleRemoveConstraintFromList = (index: number) => {
        const updated = [...constraintsList];
        updated.splice(index, 1);
        setConstraintsList(updated);
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
        } catch (err) {
            console.error("Failed to sync constraints", err);
            alert("Failed to sync constraints.");
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
                                        <button 
                                            onClick={() => handleOpenEdit(emp)}
                                            className="text-blue-600 hover:text-blue-800 font-medium px-3 py-1 bg-blue-50 hover:bg-blue-100 rounded transition"
                                        >
                                            Edit
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">
                            {editingEmployeeId ? 'Edit Employee & Settings' : 'Add New Employee'}
                        </h2>
                        
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* General Information */}
                            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                                <h4 className="font-semibold text-gray-700 text-sm">General Info</h4>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                                    <input 
                                        type="text" required value={newName} onChange={(e) => setNewName(e.target.value)}
                                        className="w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
                                        <input 
                                            type="color" value={`#${newColor.replace('#', '')}`} onChange={(e) => setNewColor(e.target.value.substring(1))}
                                            className="h-8 w-full cursor-pointer border border-gray-300 rounded"
                                        />
                                    </div>
                                    <div className="flex-1 flex items-center mt-5">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
                                                className="w-4 h-4 text-blue-600"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Is Active</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Optimization Settings (Only visible in Edit Mode) */}
                            {editingEmployeeId && (
                                <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg space-y-4">
                                    <h4 className="font-semibold text-blue-800 text-sm">Optimization Settings</h4>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Shifts limits */}
                                        <div className="space-y-2">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Min Shifts / Week</label>
                                                <input type="number" min="0" value={minShifts} onChange={(e) => setMinShifts(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Max Shifts / Week</label>
                                                <input type="number" min="0" value={maxShifts} onChange={(e) => setMaxShifts(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                            </div>
                                        </div>

                                        {/* Morning Limits */}
                                        <div className="space-y-2">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Min Mornings</label>
                                                <input type="number" min="0" value={minMornings} onChange={(e) => setMinMornings(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Max Mornings</label>
                                                <input type="number" min="0" value={maxMornings} onChange={(e) => setMaxMornings(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                            </div>
                                        </div>

                                        {/* Evening Limits */}
                                        <div className="space-y-2">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Min Evenings</label>
                                                <input type="number" min="0" value={minEvenings} onChange={(e) => setMinEvenings(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Max Evenings</label>
                                                <input type="number" min="0" value={maxEvenings} onChange={(e) => setMaxEvenings(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                            </div>
                                        </div>

                                        {/* Night Limits */}
                                        <div className="space-y-2">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Min Nights</label>
                                                <input type="number" min="0" value={minNights} onChange={(e) => setMinNights(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Max Nights</label>
                                                <input type="number" min="0" value={maxNights} onChange={(e) => setMaxNights(Number(e.target.value))} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50">
                                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Constraints Modal Overlay */}
            {isConstraintsModalOpen && selectedEmpForConstraints && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-1">Constraints: {selectedEmpForConstraints.name}</h2>
                        <p className="text-sm text-gray-500 mb-4">Manage availability for the selected date range.</p>
                        
                        {/* Range Selectors */}
                        <div className="flex gap-4 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Sync Start Date</label>
                                <input type="date" value={syncStartDate} onChange={(e) => setSyncStartDate(e.target.value)} className="border border-gray-300 rounded p-1.5 text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Sync End Date</label>
                                <input type="date" value={syncEndDate} onChange={(e) => setSyncEndDate(e.target.value)} className="border border-gray-300 rounded p-1.5 text-sm" />
                            </div>
                            <div className="flex items-end">
                                <button onClick={() => handleOpenConstraints(selectedEmpForConstraints)} className="bg-gray-200 hover:bg-gray-300 px-3 py-1.5 rounded text-sm font-medium transition">Load Range</button>
                            </div>
                        </div>

                        {/* Add New Constraint Form */}
                        <div className="flex gap-2 items-end mb-6">
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                                <input type="date" value={constDate} onChange={(e) => setConstDate(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm" />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Shift</label>
                                <select value={constShift} onChange={(e) => setConstShift(Number(e.target.value))} className="w-full border border-gray-300 rounded p-2 text-sm bg-white">
                                    <option value={1}>Morning (1)</option>
                                    <option value={2}>Evening (2)</option>
                                    <option value={3}>Night (3)</option>
                                </select>
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                                <select value={constType} onChange={(e) => setConstType(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm bg-white">
                                    <option value="CANNOT_WORK">Cannot Work</option>
                                    <option value="MUST_WORK">Must Work / Prefer</option>
                                </select>
                            </div>
                            <button onClick={handleAddConstraintToList} className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 transition h-[38px]">
                                Add
                            </button>
                        </div>

                        {/* Constraints List Table */}
                        <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-gray-600 text-xs">
                                    <tr>
                                        <th className="px-4 py-2 font-medium">Date</th>
                                        <th className="px-4 py-2 font-medium">Shift ID</th>
                                        <th className="px-4 py-2 font-medium">Type</th>
                                        <th className="px-4 py-2 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-sm">
                                    {constraintsList.length === 0 ? (
                                        <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-500">No constraints added yet.</td></tr>
                                    ) : (
                                        constraintsList.map((c, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50">
                                                <td className="px-4 py-2">{c.date}</td>
                                                <td className="px-4 py-2">{c.shift_id}</td>
                                                <td className="px-4 py-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.constraint_type === 'CANNOT_WORK' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                        {c.constraint_type.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    <button onClick={() => handleRemoveConstraintFromList(idx)} className="text-red-500 hover:text-red-700 text-xs font-medium">Remove</button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                            <button onClick={() => setIsConstraintsModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition">Cancel</button>
                            <button onClick={handleSyncConstraints} disabled={isSubmitting} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 transition disabled:opacity-50">
                                {isSubmitting ? 'Syncing...' : 'Save & Sync'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}