// frontend/src/hooks/useStoredFlag.ts
import { useCallback, useState } from 'react';

const readFlag = (key: string, initial: boolean): boolean => {
    try {
        const stored = localStorage.getItem(key);
        return stored === null ? initial : stored === '1';
    } catch {
        // Storage blocked (privacy mode): fall back to the default
        return initial;
    }
};

/**
 * A boolean UI preference remembered in this browser (localStorage, '1' / '0').
 * When storage is unavailable it still works, it just isn't remembered.
 */
export function useStoredFlag(key: string, initial: boolean): [boolean, (next: boolean) => void] {
    const [value, setValue] = useState(() => readFlag(key, initial));

    const set = useCallback((next: boolean) => {
        setValue(next);
        try {
            localStorage.setItem(key, next ? '1' : '0');
        } catch {
            // Not remembered; the toggle still applies for this visit
        }
    }, [key]);

    return [value, set];
}
