// src/features/constraints/hooks/useImportConstraints.ts
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { importConstraintsFromHtml } from '@/api/constraints';
import { logError, toAppError } from '@/api/errors';
import { upcomingSunday } from '@/lib/dates';
import { notify } from '@/lib/notify';
import type { ImportConstraintsResult } from '@/types';
import { invalidateConstraintViews } from './constraintCaches';

/** The systems a constraints export can come from; ids match the backend ConstraintSource enum. */
export const IMPORT_SOURCES = [
    { id: 'yalam', name: 'Yalam' },
    { id: 'mishmarot', name: 'Mishmarot' },
];

/** Why a file can't be imported, or null for an HTML export. */
export const htmlFileError = (file: File): string | null => {
    const name = file.name.toLowerCase();
    return name.endsWith('.html') || name.endsWith('.htm') ? null : 'יש לבחור קובץ HTML (סיומת ‎.html או ‎.htm).';
};

// Nothing the user must read: every employee in the file was found and updated
const isClean = (result: ImportConstraintsResult): boolean =>
    result.processed_employees_count > 0 && result.missing_employees_ids.length === 0;

interface ImportRequest {
    file: File;
    source: string;
    weekStart: string;
}

/**
 * The constraints import form: an HTML export from an external system, its source, and the week it
 * covers (the upcoming Sunday by default). A clean import shows a toast; one that needs explaining
 * (unlinked employees, or nobody found) is kept as `result`. Any import that updated employees
 * refreshes every cached view of constraints. Mount it once per opening, since it starts empty.
 */
export function useImportConstraints(locationId: number) {
    const queryClient = useQueryClient();
    const [file, setFile] = useState<File | null>(null);
    const [source, setSource] = useState<string>(IMPORT_SOURCES[0].id);
    const [weekStart, setWeekStart] = useState<string>(() => upcomingSunday());
    // A check that failed before sending
    const [validationError, setValidationError] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: (request: ImportRequest) =>
            importConstraintsFromHtml(request.file, request.source, request.weekStart, locationId),
        onSuccess: (result) => {
            if (isClean(result)) {
                const notesPart = result.imported_notes_count > 0 ? ` ו-${result.imported_notes_count} הערות` : '';
                notify.success('האילוצים יובאו', `עודכנו אילוצים עבור ${result.processed_employees_count} עובדים${notesPart}.`);
            }
            if (result.processed_employees_count > 0) return invalidateConstraintViews(queryClient);
        },
        onError: (error) => logError('Failed to import constraints:', error),
    });

    /** Takes the picked file, or refuses one that isn't an HTML export. */
    const chooseFile = (picked: File) => {
        const fileError = htmlFileError(picked);
        mutation.reset();
        setValidationError(fileError);
        setFile(fileError ? null : picked);
    };

    /** Runs the import. Returns true for a clean import, so the modal can close. */
    const submit = async (): Promise<boolean> => {
        const missing = !file ? 'יש לבחור קובץ HTML לייבוא.' : !weekStart ? 'יש לבחור את תאריך תחילת השבוע.' : null;
        if (missing || !file) {
            mutation.reset();
            setValidationError(missing);
            return false;
        }
        setValidationError(null);
        try {
            return isClean(await mutation.mutateAsync({ file, source, weekStart }));
        } catch {
            return false;
        }
    };

    const result = mutation.data && !isClean(mutation.data) ? mutation.data : null;
    // The reason comes from the backend error code when there is one (e.g. no shifts defined)
    const error = validationError ?? (mutation.error ? toAppError(mutation.error).message : null);

    return {
        file,
        source,
        setSource,
        weekStart,
        setWeekStart,
        chooseFile,
        submit,
        error,
        result,
        isPending: mutation.isPending,
    };
}
