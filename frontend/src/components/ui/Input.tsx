// src/components/ui/Input.tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const FIELD_CLASS =
    'w-full rounded border border-gray-300 bg-white p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
    'disabled:bg-gray-100 disabled:opacity-60';

interface FieldProps {
    /** Red border; pair it with the error text under the field */
    invalid?: boolean;
}

/** Text-like input (text, email, password, number, date) in the app's form style. */
export function Input({ invalid, className, ...props }: ComponentProps<'input'> & FieldProps) {
    return (
        <input
            aria-invalid={invalid || undefined}
            className={cn(FIELD_CLASS, invalid && 'border-red-500', className)}
            {...props}
        />
    );
}

/** Native select in the same style as Input. */
export function Select({ invalid, className, ...props }: ComponentProps<'select'> & FieldProps) {
    return (
        <select
            aria-invalid={invalid || undefined}
            className={cn(FIELD_CLASS, invalid && 'border-red-500', className)}
            {...props}
        />
    );
}

/** Multi-line text in the same style as Input. */
export function Textarea({ invalid, className, ...props }: ComponentProps<'textarea'> & FieldProps) {
    return (
        <textarea
            aria-invalid={invalid || undefined}
            className={cn(FIELD_CLASS, invalid && 'border-red-500', className)}
            {...props}
        />
    );
}
