// src/features/positions/PositionPicker.tsx
import { Check, Star } from 'lucide-react';
import type { Position } from '../../types';
import { toCssColor } from '../../lib/color';

interface PositionPickerProps {
    // Active roles of the location, in display order
    positions: Position[];
    selectedIds: number[];
    primaryId: number | null;
    onChange: (selectedIds: number[], primaryId: number | null) => void;
    disabled?: boolean;
}

/**
 * Toggle chips for the roles an employee can fill, with a star to pick the primary one.
 * The first role selected becomes primary; removing the primary passes it to the next selected role.
 */
export default function PositionPicker({ positions, selectedIds, primaryId, onChange, disabled = false }: PositionPickerProps) {
    const toggle = (positionId: number) => {
        if (selectedIds.includes(positionId)) {
            const remaining = selectedIds.filter(id => id !== positionId);
            const nextPrimary = primaryId === positionId ? (remaining[0] ?? null) : primaryId;
            onChange(remaining, nextPrimary);
        } else {
            onChange([...selectedIds, positionId], primaryId ?? positionId);
        }
    };

    if (positions.length === 0) {
        return <p className="text-xs text-gray-500">לא הוגדרו תפקידים באתר. אפשר להוסיף אותם בהגדרות אתר.</p>;
    }

    return (
        <div className="flex flex-wrap gap-2">
            {positions.map(position => {
                const isSelected = selectedIds.includes(position.id);
                const isPrimary = isSelected && primaryId === position.id;
                const color = toCssColor(position.color);
                return (
                    <div
                        key={position.id}
                        className={`flex items-center rounded-full border text-sm transition ${isSelected ? 'shadow-sm' : 'bg-white border-gray-300 text-gray-600'}`}
                        style={isSelected ? { borderColor: color, backgroundColor: `${color}26` } : undefined}
                    >
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => toggle(position.id)}
                            aria-pressed={isSelected}
                            className="flex items-center gap-1 ps-3 pe-2 py-1 rounded-full disabled:opacity-50"
                        >
                            {isSelected && <Check size={14} />}
                            {position.name}
                        </button>
                        {isSelected && (
                            <button
                                type="button"
                                disabled={disabled || isPrimary}
                                onClick={() => onChange(selectedIds, position.id)}
                                aria-label={isPrimary ? `${position.name} הוא התפקיד הראשי` : `הגדר את ${position.name} כתפקיד ראשי`}
                                title={isPrimary ? 'תפקיד ראשי' : 'הגדר כתפקיד ראשי'}
                                className="pe-2 py-1 disabled:cursor-default"
                            >
                                <Star size={14} className={isPrimary ? 'fill-amber-400 text-amber-500' : 'text-gray-400 hover:text-amber-500'} />
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
