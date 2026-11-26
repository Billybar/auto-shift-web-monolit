// src/features/constraints/components/ImportConstraintsModal.tsx
import type { ChangeEvent, FormEvent } from 'react';
import { X, UploadCloud } from 'lucide-react';
import InlineAlert from '@/components/ui/InlineAlert';
import Button from '@/components/ui/Button';
import FormField from '@/components/ui/FormField';
import { Input, Select } from '@/components/ui/Input';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { IMPORT_SOURCES, useImportConstraints } from '@/features/constraints/hooks/useImportConstraints';

export interface ImportConstraintsModalProps {
    onClose: () => void;
    locationId: number;
}

/**
 * Imports a week of constraints from an external system's HTML export. Mount it only while open:
 * each opening starts with an empty form.
 */
export default function ImportConstraintsModal({ onClose, locationId }: ImportConstraintsModalProps) {
    const {
        file, source, setSource, weekStart, setWeekStart, chooseFile, submit, error, result, isPending: isSubmitting,
    } = useImportConstraints(locationId);

    const sourceName = IMPORT_SOURCES.find(src => src.id === source)?.name ?? source;

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const picked = e.target.files?.[0];
        if (picked) chooseFile(picked);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        // A clean import closes the modal; anything the user should act on stays on screen
        if (await submit()) onClose();
    };

    return (
        // The backdrop doesn't close it (as before); Esc and X do, except while the import runs
        <Dialog open onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
            <DialogContent
                size="md"
                closeOnBackdrop={false}
                aria-describedby={undefined}
                className="p-0 rounded-2xl flex flex-col"
            >
                {/* Header */}
                <div className="flex justify-between items-center p-5 border-b border-slate-100">
                    <DialogTitle className="text-slate-800 flex items-center gap-2">
                        <UploadCloud className="text-blue-600" size={24} />
                        ייבוא אילוצים ממערכת חיצונית
                    </DialogTitle>
                    <DialogClose
                        aria-label="סגירה"
                        disabled={isSubmitting}
                        className="text-slate-400 hover:text-slate-600 transition disabled:opacity-50"
                    >
                        <X size={20} />
                    </DialogClose>
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
                            <Button variant="secondary" onClick={onClose} className="px-5 py-2.5">
                                סגירה
                            </Button>
                        </div>
                    </div>
                ) : (
                /* Body (Form) */
                <form onSubmit={handleSubmit} className="p-6 space-y-5">

                    {/* Error Banner */}
                    {error && <InlineAlert variant="error" title="הייבוא נכשל">{error}</InlineAlert>}

                    {/* Source Selection */}
                    <FormField label="מקור הנתונים" htmlFor="import-source">
                        <Select
                            id="import-source"
                            value={source}
                            onChange={(e) => setSource(e.target.value)}
                            disabled={isSubmitting}
                            className="rounded-lg p-2.5"
                        >
                            {IMPORT_SOURCES.map(src => (
                                <option key={src.id} value={src.id}>{src.name}</option>
                            ))}
                        </Select>
                    </FormField>

                    {/* Start Date Selection */}
                    <FormField label="תאריך תחילת שבוע (ראשון)" htmlFor="import-week-start">
                        <Input
                            id="import-week-start"
                            type="date"
                            value={weekStart}
                            onChange={(e) => setWeekStart(e.target.value)}
                            disabled={isSubmitting}
                            className="rounded-lg p-2.5"
                        />
                    </FormField>

                    {/* File Upload */}
                    <FormField label="קובץ HTML" htmlFor="import-file">
                        <input
                            id="import-file"
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
                    </FormField>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-2">
                        <Button variant="secondary" onClick={onClose} disabled={isSubmitting} className="px-5 py-2.5">
                            ביטול
                        </Button>
                        <Button type="submit" loading={isSubmitting} disabled={!file} className="px-5 py-2.5 shadow-sm">
                            {isSubmitting ? 'מייבא נתונים...' : (
                                <>
                                    <UploadCloud size={18} />
                                    ייבא עכשיו
                                </>
                            )}
                        </Button>
                    </div>
                </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
