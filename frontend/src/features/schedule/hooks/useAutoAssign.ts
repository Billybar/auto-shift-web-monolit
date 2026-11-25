// src/features/schedule/hooks/useAutoAssign.ts
import { useState } from 'react';

import { generateAutoSchedule } from '@/api/assignments';
import { logError, toAppError } from '@/api/errors';
import { notify } from '@/lib/notify';
import type { Assignment, AutoScheduleResult, ShiftDayDemand } from '@/types';
import { formatDayLabel } from './scheduleLabels';
import type { NameLookups } from './scheduleLabels';
import { boardKeyOf } from './scheduleWeek';

// Shown when the solver finds no schedule that satisfies every hard rule (see ConstraintManager).
// Missing people no longer fail the run: those slots come back empty and are listed instead.
export const INFEASIBLE_CAUSES = [
    'אילוצי "חייב" שמתנגשים זה בזה או עם כללי המנוחה (פחות מ-8 שעות בין משמרות, למשל לילה ולמחרת בוקר), או שתי משמרות באותו יום',
    'מינימום משמרות שבועי של עובד שלא מתיישב עם האילוצים שלו (למשל רצף של 7 ימי עבודה)',
    'מקסימום משמרות שבועי שנמוך ממספר אילוצי "חייב" של העובד',
];

// Outcome of the last auto-assign run that needs explaining; shown above the grid until dismissed
export interface EngineIssue {
    variant: 'error' | 'warning' | 'info';
    title: string;
    message: string;
    items?: string[];
}

/** One line per gap the engine left, and per input it set aside, by role and day. */
export const describeEngineResult = (response: AutoScheduleResult, names: NameLookups): string[] => {
    const { shiftName, positionName, employeeName } = names;

    const gaps = response.unfilled_slots.map(slot =>
        `${formatDayLabel(slot.date)} · ${shiftName(slot.shift_id)} · ${positionName(slot.position_id)}: חסרים ${slot.missing}`
    );
    const warnings = response.warnings.map(warning => {
        switch (warning.code) {
            case 'employee_skipped_no_positions':
                return `${employeeName(warning.employee_id)}: אין תפקיד פעיל, ולכן לא שובץ`;
            case 'must_work_ignored':
                return `${employeeName(warning.employee_id)}: אילוץ "חייב" ב${formatDayLabel(warning.date)} (${shiftName(warning.shift_id)}) לא נלקח בחשבון, כי המשמרת לא צריכה אף תפקיד שלו`;
            case 'min_shifts_lowered':
                return `${employeeName(warning.employee_id)}: מינימום המשמרות הורד מ-${warning.requested} ל-${warning.applied}, כי אין לו מספיק ימים זמינים`;
        }
    });
    return [...gaps, ...warnings];
};

interface AutoAssignOptions {
    locationId: number | null;
    startDate: string;
    demandMap: Record<string, ShiftDayDemand>;
    names: NameLookups;
    // Puts the engine's draft on the board of `boardKey`'s week; saving it is a separate step
    onDraft: (assignments: Assignment[], boardKey: string) => void;
}

/**
 * Runs the engine on the week and explains the outcome. The explanation stays until dismissed,
 * the next run, or a week or location change.
 */
export function useAutoAssign({ locationId, startDate, demandMap, names, onDraft }: AutoAssignOptions) {
    const [isGenerating, setIsGenerating] = useState(false);

    // The explanation belongs to one location and week, like the board (see useScheduleBoard)
    const boardKey = boardKeyOf(locationId, startDate);
    const [shown, setShown] = useState<{ key: string; issue: EngineIssue | null }>({ key: boardKey, issue: null });
    if (shown.key !== boardKey) {
        setShown({ key: boardKey, issue: null });
    }
    const issue = shown.key === boardKey ? shown.issue : null;

    const run = async () => {
        if (!locationId) return;
        // A result that arrives after the user moved to another week is dropped
        const key = boardKey;
        const setIssue = (next: EngineIssue | null) =>
            setShown(prev => (prev.key === key ? { key, issue: next } : prev));

        // Nothing to fill: point to the weekly template instead of running the engine
        if (!Object.values(demandMap).some(cell => cell.required_employees > 0)) {
            setIssue({
                variant: 'info',
                title: 'לא הוגדר תקן לשבוע זה',
                message: 'הגדר כמה עובדים נדרשים בכל משמרת ובכל תפקיד בהגדרות אתר ← "תקן שבועי", או הוסף עמדות ישירות בלוח.',
            });
            return;
        }

        try {
            setIsGenerating(true);
            setIssue(null);
            const response = await generateAutoSchedule(locationId, startDate);

            // The board keeps its assignments; explain why nothing was found
            if (response.status === 'FAILED') {
                setIssue(response.failure_reason === 'time_limit'
                    ? {
                        variant: 'error',
                        title: 'לא נמצא שיבוץ בזמן',
                        message: 'המנוע לא הספיק למצוא שיבוץ בזמן שהוקצב לו. נסה שוב, או הקל על חלק מהאילוצים.',
                    }
                    : {
                        variant: 'error',
                        title: 'לא נמצא שיבוץ אפשרי',
                        message: 'המערכת לא מצאה שיבוץ שעומד בכל הכללים הקשיחים. הסיבות הנפוצות:',
                        items: INFEASIBLE_CAUSES,
                    });
                return;
            }

            onDraft(response.draft_assignments, key);

            // Total penalties; lower is better
            const score = `ציון קנסות: ${response.penalty_score ?? '—'} (נמוך יותר = טוב יותר). השיבוץ עדיין לא נשמר.`;
            const items = describeEngineResult(response, names);
            if (items.length > 0) {
                // Partial success the user must read: stays above the grid
                setIssue({
                    variant: 'warning',
                    title: response.unfilled_slots.length > 0 ? 'השיבוץ הושלם, אבל חלק מהעמדות נשארו ריקות' : 'השיבוץ הושלם עם הערות',
                    message: score,
                    items,
                });
                return;
            }

            notify.success(response.status === 'OPTIMAL' ? 'נמצא שיבוץ אופטימלי' : 'נמצא שיבוץ תקין', score);
        } catch (error) {
            logError('Engine generation failed:', error);
            setIssue({ variant: 'error', title: 'השיבוץ האוטומטי נכשל', message: toAppError(error).message });
        } finally {
            setIsGenerating(false);
        }
    };

    return { run, isGenerating, issue, dismissIssue: () => setShown({ key: boardKey, issue: null }) };
}
