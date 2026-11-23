// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names; a later Tailwind class wins over an earlier one of the same kind (e.g. a caller's padding). */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
