// frontend/src/features/schedule/OptimizationWeightsModal.tsx
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent, PointerEvent } from 'react';
import { Slider } from 'radix-ui';
import { X, ChevronUp, ChevronDown, Info } from 'lucide-react';

import type { LocationWeights } from '../../types';
import InlineAlert from '../../components/ui/InlineAlert';
import { useHoldRepeat } from './hooks/useHoldRepeat';

type WeightKey = keyof Omit<LocationWeights, 'id' | 'location_id'>;

// The slider value is the weight itself. The solver only compares weights to each other,
// so the filled bar shows how much a rule counts relative to the others.
// A stored weight above the max shows at the end of the bar (the number shows the real value)
// and is kept unless the user changes it.
const WEIGHT_MAX = 50;

interface WeightField {
    key: WeightKey;
    label: string;
    hint?: string;
}

// One list of rules, split into sections by a divider: rest rules first, then the
// per-employee shift-count rules (target and the min/max from each employee's settings)
const WEIGHT_SECTIONS: WeightField[][] = [
    [
        { key: 'rest_gap', label: 'מנוחה קצרה בין משמרות', hint: 'למשל ערב ואחריו בוקר למחרת' },
        { key: 'consecutive_nights', label: '3 לילות ברצף' },
    ],
    [
        { key: 'target_shifts', label: 'יעד משמרות לעובד' },
        { key: 'min_mornings', label: 'מינ\' בקרים' },
        { key: 'max_mornings', label: 'מקס בקרים' },
        { key: 'min_evenings', label: 'מינ\' ערבים' },
        { key: 'max_evenings', label: 'מקס ערבים' },
        { key: 'min_nights', label: 'מינ\' לילות' },
        { key: 'max_nights', label: 'מקס לילות' },
    ],
];

// Label column + slider column, shared by the group header and the rows so the sliders line up
const ROW_GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-[14rem_1fr] items-center gap-x-4 gap-y-1';

// Fixed widths around the slider (step arrows on the right, value on the left), reused as
// spacers in the group header so the scale labels stay aligned with the track
const STEP_COLUMN_CLASS = 'w-5 shrink-0';
const VALUE_COLUMN_CLASS = 'w-10 shrink-0';
const STEP_BUTTON_CLASS = 'flex items-center justify-center h-3.5 w-5 rounded touch-none select-none text-slate-500 hover:text-slate-800 hover:bg-blue-100 transition disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed';

interface OptimizationWeightsModalProps {
    weights: LocationWeights;
    onChange: (next: LocationWeights) => void;
    onSubmit: (e: FormEvent) => void;
    onClose: () => void;
    isSubmitting: boolean;
    // Why the last save failed (shown inline; the modal stays open so the user can retry)
    error?: string | null;
}

/**
 * Modal for tuning the solver's soft-constraint penalty weights of a location.
 * Each rule is a slider from "allowed" (0, rule ignored) to "avoid at all costs".
 * State and saving stay in the parent; this component only renders and reports changes.
 */
export default function OptimizationWeightsModal({ weights, onChange, onSubmit, onClose, isSubmitting, error }: OptimizationWeightsModalProps) {
    const setWeight = (key: WeightKey, value: number) => onChange({ ...weights, [key]: value });
    const [showExplanation, setShowExplanation] = useState(false);

    // Latest weights for the held-arrow repeats, which run from timers outside the render
    const weightsRef = useRef(weights);
    useEffect(() => {
        weightsRef.current = weights;
    }, [weights]);
    const { start: startHold, stop: stopHold } = useHoldRepeat();

    // Moves one weight by one point. Returns false at a bound, so a held arrow stops repeating.
    const stepWeight = (key: WeightKey, delta: 1 | -1): boolean => {
        const next = weightsRef.current[key] + delta;
        if (next < 0 || (delta > 0 && next > WEIGHT_MAX)) return false;
        const updated = { ...weightsRef.current, [key]: next };
        // Updated right away so the next repeat sees it even before the parent re-renders
        weightsRef.current = updated;
        onChange(updated);
        return true;
    };

    // Mouse/touch steps on press and repeats while held. A click with detail 0 comes from the
    // keyboard (Enter/Space), so it steps once; pointer clicks already stepped on press.
    const stepButtonHandlers = (key: WeightKey, delta: 1 | -1) => ({
        onPointerDown: (e: PointerEvent) => {
            if (e.button === 0) startHold(() => stepWeight(key, delta));
        },
        onPointerLeave: stopHold,
        onClick: (e: MouseEvent) => {
            if (e.detail === 0) stepWeight(key, delta);
        },
        // Stops the long-press context menu on touch screens
        onContextMenu: (e: MouseEvent) => e.preventDefault(),
    });

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4" dir="rtl">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl px-6 pt-6 pb-3 max-h-[90vh] overflow-y-auto relative">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 transition"
                >
                    <X size={24} />
                </button>

                <div className="mb-3">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-slate-800">כיוונון השיבוץ</h2>
                        <button
                            type="button"
                            onClick={() => setShowExplanation((open) => !open)}
                            aria-expanded={showExplanation}
                            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 transition"
                        >
                            <Info size={16} />
                            הסבר
                        </button>
                    </div>
                    {showExplanation && (
                        <p className="text-sm text-slate-500 mt-1">
                            הכללים כאן גמישים. כשאי אפשר לעמוד בכולם, המערכת תשבור קודם את הכללים שסימנת כפחות חשובים.
                            ככל שהסמן קרוב יותר ל"להימנע ככל הניתן", המערכת תתאמץ יותר לשמור על הכלל.
                        </p>
                    )}
                </div>

                <form onSubmit={onSubmit} className="space-y-2">
                    <div className="space-y-2 bg-blue-50 p-3 rounded-xl border border-blue-100">
                        {/* Header: title in the label column, the scale ends above the sliders */}
                        <div className={ROW_GRID_CLASS}>
                            <h4 className="font-semibold text-blue-800">שם האילוץ</h4>
                            <div className="flex items-center gap-2 text-xs font-small text-slate-400">
                                <span className={STEP_COLUMN_CLASS} />
                                <div className="flex grow justify-between">
                                    <span>לא להתחשב</span>
                                    <span>הימנע ככל הניתן</span>
                                </div>
                                <span className={VALUE_COLUMN_CLASS} />
                            </div>
                        </div>

                        {WEIGHT_SECTIONS.map((fields, sectionIndex) => [
                            sectionIndex > 0 && <hr key={`divider-${sectionIndex}`} className="border-t-2 border-slate-300" />,
                            fields.map(({ key, label, hint }) => (
                                <div key={key} className={ROW_GRID_CLASS}>
                                    <div>
                                        <div className="text-sm font-medium text-slate-700">
                                            {label}
                                        </div>
                                        {hint && <p className="text-xs text-slate-500">{hint}</p>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Step arrows (one point per click, repeats while held) on the "allowed" end */}
                                        <div className={`${STEP_COLUMN_CLASS} flex flex-col`}>
                                            <button
                                                type="button"
                                                aria-label={`הגדלה: ${label}`}
                                                disabled={weights[key] >= WEIGHT_MAX}
                                                {...stepButtonHandlers(key, 1)}
                                                className={STEP_BUTTON_CLASS}
                                            >
                                                <ChevronUp size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`הקטנה: ${label}`}
                                                disabled={weights[key] <= 0}
                                                {...stepButtonHandlers(key, -1)}
                                                className={STEP_BUTTON_CLASS}
                                            >
                                                <ChevronDown size={14} />
                                            </button>
                                        </div>
                                        <Slider.Root
                                            dir="rtl"
                                            min={0}
                                            max={WEIGHT_MAX}
                                            step={1}
                                            value={[Math.min(weights[key], WEIGHT_MAX)]}
                                            onValueChange={([next]) => setWeight(key, next)}
                                            className="relative flex items-center grow h-5 select-none touch-none"
                                        >
                                            <Slider.Track className="relative grow h-1.5 rounded-full bg-slate-200">
                                                <Slider.Range className="absolute h-full rounded-full bg-yellow-400" />
                                            </Slider.Track>
                                            <Slider.Thumb
                                                aria-label={label}
                                                className="block w-4 h-4 rounded-full bg-white border-2 border-yellow-500 shadow cursor-grab focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </Slider.Root>
                                        {/* Current weight as a percentage of WEIGHT_MAX on the "avoid" end */}
                                        <span className={`${VALUE_COLUMN_CLASS} text-center text-xs font-normal text-slate-700 tabular-nums`}>
                                            {weights[key] * 2}%
                                        </span>
                                    </div>
                                </div>
                            )),
                        ])}
                    </div>

                    {error && <InlineAlert variant="error" title="שמירת משקלי השיבוץ נכשלה">{error}</InlineAlert>}

                    {/* Modal Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                        >
                            ביטול
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    שומר...
                                </>
                            ) : (
                                'שמור'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
