// src/features/employees/EmployeesPage.tsx
import { useState } from 'react';
import { UserRoundPlus } from 'lucide-react';

import type { Employee } from '@/types';
import { UserRole } from '@/types';
import { useAppLocation } from '@/context/useAppLocation';
import { useAuth } from '@/context/useAuth';
import { useConfirm } from '@/context/confirmContext';
import InlineAlert from '@/components/ui/InlineAlert';
import Spinner from '@/components/ui/Spinner';
import Button from '@/components/ui/Button';
import { usePositions } from '@/features/positions/hooks/usePositions';
import EmployeeConstraintsModal from '@/features/constraints/components/EmployeeConstraintsModal';
import { useEmployees } from './hooks/useEmployees';
import { getFullName, useEmployeeSort } from './hooks/useEmployeeSort';
import { useDeleteEmployee } from './hooks/useDeleteEmployee';
import EmployeeModal from './EmployeeModal';
import EmployeesTable from './EmployeesTable';

export default function EmployeesPage() {
    const { selectedLocationId } = useAppLocation();
    const locationId = selectedLocationId || null;

    const { user } = useAuth();
    const isDispatcher = user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER || user?.role === UserRole.SCHEDULER;

    const confirm = useConfirm();

    // Roles of the location, archived included (labels for the roles column)
    const { activePositions, positionsById } = usePositions(locationId);
    // Saves and deletes refresh the list through the query cache
    const { employees, isLoading, loadError, reload } = useEmployees(locationId);
    const { sorted, sortKey, sortDir, toggleSort } = useEmployeeSort(employees);
    const { remove, deletingId } = useDeleteEmployee();

    // The add / edit modal; a null employee means "add"
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    // The employee whose constraints popup is open
    const [constraintsEmployee, setConstraintsEmployee] = useState<Employee | null>(null);

    const openModal = (emp: Employee | null) => {
        setSelectedEmployee(emp);
        setIsModalOpen(true);
    };

    const handleDelete = async (emp: Employee) => {
        const confirmed = await confirm({
            title: 'למחוק את העובד?',
            // The backend cascades the delete to the employee's user, settings, assignments, constraints and notes
            description: `המחיקה של ${getFullName(emp)} סופית: יימחקו גם חשבון המשתמש, המשמרות, האילוצים וההערות של העובד. לא ניתן לבטל פעולה זו.`,
            confirmText: 'מחיקה',
            tone: 'danger',
        });
        if (confirmed) await remove(emp.id);
    };

    if (!locationId) {
        return (
            <div className="flex justify-center items-center h-full flex-col gap-4 text-slate-500">
                <h2 className="text-xl font-medium">בחר אתר בתפריט העליון כדי לראות את העובדים</h2>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Spinner />
            </div>
        );
    }

    if (loadError) {
        return (
            <InlineAlert variant="error" title="טעינת רשימת העובדים נכשלה" action={{ label: 'נסה שוב', onClick: reload }}>
                {loadError.message}
            </InlineAlert>
        );
    }

    return (
        <div className="relative h-full">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                    <Button onClick={() => openModal(null)} className="text-base shadow-sm">
                        <UserRoundPlus size={18} />
                        <span>הוספת עובד</span>
                    </Button>
                </div>

                <EmployeesTable
                    employees={sorted}
                    positionsById={positionsById}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    onEdit={openModal}
                    onEditConstraints={setConstraintsEmployee}
                    onDelete={handleDelete}
                    deletingId={deletingId}
                />
            </div>

            <EmployeeModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                employee={selectedEmployee}
                locationId={locationId}
                positions={activePositions}
            />

            {/* Constraints popup, with a week picker */}
            {constraintsEmployee && (
                <EmployeeConstraintsModal
                    employee={constraintsEmployee}
                    isManager={isDispatcher}
                    onClose={() => setConstraintsEmployee(null)}
                />
            )}
        </div>
    );
}
