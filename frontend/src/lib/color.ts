// src/lib/color.ts

/**
 * CSS color for a stored hex value. The backend stores colors without '#' (e.g. "3B82F6"),
 * older rows may include it.
 */
export const toCssColor = (hex: string | null | undefined, fallback = '#cbd5e1'): string => {
    if (!hex) return fallback;
    return hex.startsWith('#') ? hex : `#${hex}`;
};
