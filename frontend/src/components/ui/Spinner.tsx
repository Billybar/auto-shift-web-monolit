// src/components/ui/Spinner.tsx

const SIZES = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
} as const;

export interface SpinnerProps {
    /** sm for a section of a page, md for an overlay, lg for a whole page */
    size?: keyof typeof SIZES;
}

/** The loading spinner. The caller's wrapper places it (centered page, section padding, overlay). */
export default function Spinner({ size = 'lg' }: SpinnerProps) {
    return (
        <div
            role="status"
            aria-label="טוען…"
            className={`animate-spin rounded-full border-b-2 border-blue-600 ${SIZES[size]}`}
        />
    );
}
