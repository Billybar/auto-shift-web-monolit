import React, { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import WeeklyConstraintsBoard from './WeeklyConstraintsBoard';
import ImportConstraintsModal from './components/ImportConstraintsModal';

export default function ConstraintsPage() {
    // --- Modal State ---
    const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

    // --- Auth State ---
    // TODO: Replace this mock data with your actual global auth hook.
    // Example: const { user } = useAuth();
    const loggedInEmployee = {
        id: 1, // Hardcoded for MVP, replace with dynamic logged-in user ID
        name: "ישראל ישראלי", // Replace with logged-in user name
        role: "manager" 
    };

    const isManager = loggedInEmployee.role === 'manager';

    return (
        <div className="h-full w-full max-w-6xl mx-auto pt-2 pb-6 flex flex-col gap-4">
            
            {/* Manager Actions Bar - Only visible to ADMIN */}
            {isManager && (
                <div className="flex justify-end px-1">
                    <button 
                        onClick={() => setIsImportModalOpen(true)}
                        className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 text-sm shadow-sm"
                    >
                        <UploadCloud size={18} />
                        ייבוא אילוצים ממערכת חיצונית
                    </button>
                </div>
            )}

            {/* Main Constraints Board */}
            {/* Added flex-1 and min-h-0 to ensure the board scales correctly inside the flex container */}
            <div className="flex-1 shadow-md rounded-2xl overflow-hidden border border-slate-200 p-6 bg-white min-h-0">
                <WeeklyConstraintsBoard 
                    employeeId={loggedInEmployee.id}
                    employeeName={loggedInEmployee.name}
                    isManager={isManager}
                    onSaveSuccess={() => {
                        console.log("Constraints saved successfully from the main page.");
                    }}
                />
            </div>

            {/* The Import Modal Component */}
            <ImportConstraintsModal 
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSuccess={() => {
                    alert('האילוצים יובאו בהצלחה!');
                    // Note: If the user changes the week in the board, 
                    // the new constraints will be fetched automatically.
                }}
                locationId={3} // Hardcoded for now as requested
            />
        </div>
    );
}