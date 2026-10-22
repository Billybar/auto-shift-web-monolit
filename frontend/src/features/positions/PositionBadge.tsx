// src/features/positions/PositionBadge.tsx
import { Star } from 'lucide-react';
import type { Position } from '../../types';
import { toCssColor } from '../../lib/color';

interface PositionBadgeProps {
    position: Position;
    isPrimary?: boolean;
    size?: 'xs' | 'sm';
    className?: string;
}

/**
 * A role's name on a tinted pill in the role's color. Archived roles are struck through.
 */
export default function PositionBadge({ position, isPrimary = false, size = 'sm', className = '' }: PositionBadgeProps) {
    const color = toCssColor(position.color);
    const sizeClass = size === 'xs' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5';

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap ${sizeClass} ${position.is_active ? '' : 'line-through opacity-60'} ${className}`}
            // 8-digit hex: the role color at ~15% for the fill
            style={{ borderColor: color, backgroundColor: `${color}26`, color: '#1e293b' }}
            title={position.is_active ? (isPrimary ? `${position.name} (תפקיד ראשי)` : position.name) : `${position.name} (בארכיון)`}
        >
            {isPrimary && <Star size={size === 'xs' ? 9 : 11} className="fill-amber-400 text-amber-500" />}
            {position.name}
        </span>
    );
}
