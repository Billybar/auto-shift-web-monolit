// src/components/ui/FormField.tsx
import type { ReactNode } from 'react';
import { fieldErrorId } from './fieldErrorId';
import Label from './Label';

interface FormFieldProps {
    label: ReactNode;
    /** The id of the control inside */
    htmlFor: string;
    /** Shown in red under the control */
    error?: string | null;
    /** Shown in grey under the control while there is no error */
    hint?: ReactNode;
    className?: string;
    children: ReactNode;
}

/** A label, its control, and the control's error or hint under it. */
export default function FormField({ label, htmlFor, error, hint, className, children }: FormFieldProps) {
    return (
        <div className={className}>
            <Label htmlFor={htmlFor}>{label}</Label>
            {children}
            {error ? (
                <p id={fieldErrorId(htmlFor)} className="mt-1 text-xs text-red-600">{error}</p>
            ) : (
                hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
            )}
        </div>
    );
}
