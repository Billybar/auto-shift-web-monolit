// src/features/constraints/components/ImportConstraintsModal.tsx
import React, { useState, useEffect } from 'react';
import { X, UploadCloud } from 'lucide-react';
import { importConstraintsFromHtml } from '../../../api/constraints';
import { logError, toAppError } from '../../../api/errors';
import { notify } from '../../../lib/notify';
import { upcomingSunday } from '../../../lib/dates';
import InlineAlert from '../../../components/ui/InlineAlert';
import type { ImportConstraintsResult } from '../../../types';

export interface ImportConstraintsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    locationId: number; // Passed from parent (hardcoded to 3 for now, dynamic later)
}

// Matches the backend ConstraintSource Enum. Shift Organizer ('shiftorg') is left out until it has a parser.
const SOURCES = [
    { id: 'yalam', name: 'Yalam' },
    { id: 'mishmarot', name: 'Mishmarot' },
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
    // Set when the import finished but needs explaining (unlinked employees, or nothing found)
    const [result, setResult] = useState<ImportConstraintsResult | null>(null);

    // Initialize to the upcoming Sunday by default
    const [startOfWeek, setStartOfWeek] = useState<string>(() => upcomingSunday());

    // Reset state when modal opens/closes to prevent stale data
    useEffect(() => {
        if (isOpen) {
            setFile(null);
            setError(null);
            setResult(null);
            setSource(SOURCES[0].id);
        }
    }, [isOpen]);

    const sourceName = SOURCES.find(src => src.id === source)?.name ?? source;

    // --- Handlers ---
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFile = e.target.files[0];
            // Basic frontend validation for file extension
            if (!selectedFile.name.toLowerCase().endsWith('.html') && !selectedFile.name.toLowerCase().endsWith('.htm')) {
                setError('יש לבחור קובץ HTML (סיומת ‎.html או ‎.htm).');
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
            setError('יש לבחור קובץ HTML לייבוא.');
            return;
        }
        if (!startOfWeek) {
            setError('יש לבחור את תאריך תחילת השבוע.');
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);

            const importResult = await importConstraintsFromHtml(file, source, startOfWeek, locationId);
            if (importResult.processed_employees_count > 0) onSuccess();

            // A clean import closes the modal; anything the user should act on stays on screen
            if (importResult.processed_employees_count > 0 && importResult.missing_employees_ids.length === 0) {
                const notesPart = importResult.imported_notes_count > 0 ? ` ו-${importResult.imported_notes_count} הערות` : '';
                notify.success('האילוצים יובאו', `עודכנו אילוצים עבור ${importResult.processed_employees_count} עובדים${notesPart}.`);
                onClose();
            } else {
                setResult(importResult);
            }
        } catch (err) {
            // The reason comes from the backend error code when there is one (e.g. no shifts defined)
            logError("Failed to import constraints:", err);
            setError(toAppError(err).message);
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

                {result ? (
                    /* Result: the import ran, but part of the file couldn't be applied */
                    <div className="p-6 space-y-4">
                        {result.processed_employees_count > 0 && (
                            <InlineAlert variant="success" title="האילוצים יובאו חלקית">
                                עודכנו אילוצים עבור {result.processed_employees_count} עובדים.
                            </InlineAlert>
                        )}

                        {result.missing_employees_ids.length > 0 ? (
                            <InlineAlert
                                variant="warning"
                                title={`${result.missing_employees_ids.length} עובדים מהקובץ לא יובאו`}
                                items={result.missing_employees_ids}
                            >
                                המזהים הבאים לא מקושרים לאף עובד באתר זה. כדי לייבא אותם, הזן את מזהה ה-{sourceName} בכרטיס העובד
                                (ניהול עובדים ← עריכה) והרץ את הייבוא שוב.
                            </InlineAlert>
                        ) : (
                            <InlineAlert variant="warning" title="לא נמצאו עובדים בקובץ">
                                ודא שבחרת את מקור הנתונים הנכון ושזה קובץ האילוצים השבועי שיוצא מ-{sourceName}.
                            </InlineAlert>
                        )}

                        <div className="flex justify-end pt-4 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-5 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition font-medium text-sm"
                            >
                                סגירה
                            </button>
                        </div>
                    </div>
                ) : (
                /* Body (Form) */
                <form onSubmit={handleSubmit} className="p-6 space-y-5">

                    {/* Error Banner */}
                    {error && <InlineAlert variant="error" title="הייבוא נכשל">{error}</InlineAlert>}

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
                )}
            </div>
        </div>
    );
}
