// src/features/constraints/components/ImportConstraintsModal.tsx
import React, { useState, useEffect } from 'react';
import { X, UploadCloud, AlertCircle } from 'lucide-react';
import { importConstraintsFromHtml } from '../../../api/constraints';

export interface ImportConstraintsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    locationId: number; // Passed from parent (hardcoded to 3 for now, dynamic later)
}

// Matches the backend ConstraintSource Enum
const SOURCES = [
    { id: 'yalam', name: 'Yalam' },
    { id: 'mishmarot', name: 'Mishmarot' },
    { id: 'shiftorganizer', name: 'Shift Organizer' }
];

export default function ImportConstraintsModal({ 
    isOpen, 
    onClose, 
    onSuccess, 
    locationId 
}: ImportConstraintsModalProps) {
    
    // --- State ---
    const [file, setFile] = useState<File | null>(null);
    const [source, setSource] = useState<string>(SOURCES[0].id);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Initialize to the upcoming Sunday by default
    const [startOfWeek, setStartOfWeek] = useState<string>(() => {
        const today = new Date();
        const daysUntilSunday = 7 - today.getDay();
        const nextSunday = new Date(today);
        nextSunday.setDate(today.getDate() + daysUntilSunday);
        return nextSunday.toISOString().split('T')[0];
    });

    // Reset state when modal opens/closes to prevent stale data
    useEffect(() => {
        if (isOpen) {
            setFile(null);
            setError(null);
            setSource(SOURCES[0].id);
        }
    }, [isOpen]);

    // --- Handlers ---
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFile = e.target.files[0];
            // Basic frontend validation for file extension
            if (!selectedFile.name.toLowerCase().endsWith('.html') && !selectedFile.name.toLowerCase().endsWith('.htm')) {
                setError("Invalid file format. Please select an HTML file.");
                setFile(null);
                return;
            }
            setFile(selectedFile);
            setError(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!file) {
            setError("Please select an HTML file to import.");
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);
            
            // Call the existing API function
            await importConstraintsFromHtml(file, source, startOfWeek, locationId);
            
            // If successful, trigger the callback and close
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error("Failed to import constraints:", err);
            // Extract backend error message if available
            const backendMsg = err.response?.data?.detail || "An unexpected error occurred during import.";
            setError(backendMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Do not render anything if the modal is not open
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 transition-opacity" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
                
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-slate-100">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <UploadCloud className="text-blue-600" size={24} />
                        ייבוא אילוצים ממערכת חיצונית
                    </h3>
                    <button 
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="text-slate-400 hover:text-slate-600 transition disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body (Form) */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    
                    {/* Error Banner */}
                    {error && (
                        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-start gap-2 border border-red-200">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Source Selection */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">מקור הנתונים</label>
                        <select 
                            value={source}
                            onChange={(e) => setSource(e.target.value)}
                            disabled={isSubmitting}
                            className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 disabled:opacity-60"
                        >
                            {SOURCES.map(src => (
                                <option key={src.id} value={src.id}>{src.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Start Date Selection */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">תאריך תחילת שבוע (ראשון)</label>
                        <input 
                            type="date" 
                            value={startOfWeek}
                            onChange={(e) => setStartOfWeek(e.target.value)}
                            disabled={isSubmitting}
                            className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 disabled:opacity-60"
                        />
                    </div>

                    {/* File Upload */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">קובץ HTML</label>
                        <input 
                            type="file" 
                            accept=".html,.htm"
                            onChange={handleFileChange}
                            disabled={isSubmitting}
                            className="w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition disabled:opacity-60 cursor-pointer border border-slate-300 rounded-lg"
                        />
                        {file && (
                            <p className="mt-2 text-xs text-green-600 font-medium truncate">
                                קובץ נבחר: {file.name}
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
                        <button 
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-5 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition font-medium text-sm disabled:opacity-50"
                        >
                            ביטול
                        </button>
                        <button 
                            type="submit"
                            disabled={isSubmitting || !file}
                            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    מייבא נתונים...
                                </>
                            ) : (
                                <>
                                    <UploadCloud size={18} />
                                    ייבא עכשיו
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}