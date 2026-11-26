// frontend/src/features/schedule/hooks/useHoldRepeat.ts
import { useCallback, useEffect, useRef } from 'react';

// Pause before a held button starts repeating, then the time between repeats
const HOLD_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 60;

/**
 * Press-and-hold auto-repeat for step buttons.
 * start(step) runs step once, then keeps running it while the button is held,
 * until stop() is called or step returns false (e.g. a bound was reached).
 */
export function useHoldRepeat() {
    const timeoutRef = useRef<number | null>(null);
    const intervalRef = useRef<number | null>(null);

    const stop = useCallback(() => {
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
        if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
        timeoutRef.current = null;
        intervalRef.current = null;
    }, []);

    // A release anywhere ends the hold, also when the button became disabled mid-hold
    // (disabled buttons get no pointer events) or the window lost focus
    useEffect(() => {
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
        window.addEventListener('blur', stop);
        return () => {
            window.removeEventListener('pointerup', stop);
            window.removeEventListener('pointercancel', stop);
            window.removeEventListener('blur', stop);
            stop();
        };
    }, [stop]);

    const start = useCallback((step: () => boolean) => {
        stop();
        if (!step()) return;
        timeoutRef.current = window.setTimeout(() => {
            intervalRef.current = window.setInterval(() => {
                if (!step()) stop();
            }, REPEAT_INTERVAL_MS);
        }, HOLD_DELAY_MS);
    }, [stop]);

    return { start, stop };
}
