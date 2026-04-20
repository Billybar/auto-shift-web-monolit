import React, { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types/index';
import WeeklyConstraintsBoard from './WeeklyConstraintsBoard';
import ImportConstraintsModal from './components/ImportConstraintsModal';
import { useAppLocation } from '../../context/LocationContext';

export default function ConstraintsPage() {
    // --- Modal State ---
    const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

    // --- Auth State ---
    const { user } = useAuth();
    // --- Get Location
    const { selectedLocationId } = useAppLocation();
    
    // Define manager privileges (Admin and Manager roles can import constraints)
    const isDispatcher = user?.role === UserRole.ADMIN || user?.role === UserRole.MANAGER || user?.role === UserRole.SCHEDULER;

    // Check if a valid location is selected (must be a number, not an empty string)
    const hasValidLocation = typeof selectedLocationId === 'number';

    return (
        <div className="h-full w-full max-w-6xl mx-auto pt-2 pb-6 flex flex-col gap-4">
            
            {/* Manager Actions Bar - Only visible to ADMIN */}
            {isDispatcher && (
                <div className="flex justify-end px-1">
                    <button 
                        onClick={() => setIsImportModalOpen(true)}
                        // Disable the button if no valid location is selected
                        disabled={!hasValidLocation}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white transition rounded-lg shadow-sm 
                            ${hasValidLocation 
                                ? 'bg-slate-800 hover:bg-slate-700' 
                                : 'bg-slate-400 cursor-not-allowed'}`}
                        title={!hasValidLocation ? "יש לבחור מיקום תחילה" : "ייבוא אילוצים"}
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
                    // Pass the real ID from the JWT token, fallback to 0 safely
                    employeeId={user?.employee_id || 0} 
                    employeeName={user?`${user.first_name} ${user.last_name}` : 'Unknown Employee'}
                    isManager={isDispatcher}
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
                locationId={hasValidLocation ? selectedLocationId : 0}
            />
        </div>
    );
}