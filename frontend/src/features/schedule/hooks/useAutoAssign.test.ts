import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { generateAutoSchedule } from '@/api/assignments';
import { notify } from '@/lib/notify';
import type { AutoScheduleResult, ShiftDayDemand } from '@/types';
import type { NameLookups } from './scheduleLabels';
import { INFEASIBLE_CAUSES, useAutoAssign } from './useAutoAssign';

vi.mock('@/api/assignments', () => ({ generateAutoSchedule: vi.fn() }));

const SUN = '2026-11-29';
const DEMAND: Record<string, ShiftDayDemand> = {
    [`1|${SUN}|3`]: { shift_id: 1, position_id: 3, date: SUN, required_employees: 2, is_override: false },
};
const NAMES: NameLookups = {
    shiftName: id => `shift ${id}`,
    positionName: id => `role ${id}`,
    employeeName: id => `emp ${id}`,
};
const DRAFT = [{ employee_id: 7, shift_id: 1, date: SUN, position_id: 3 }];

const engineResult = (overrides: Partial<AutoScheduleResult> = {}): AutoScheduleResult => ({
    status: 'OPTIMAL',
    failure_reason: null,
    penalty_score: 4,
    draft_assignments: DRAFT,
    unfilled_slots: [],
    warnings: [],
    ...overrides,
});

const renderAutoAssign = (demandMap = DEMAND) => {
    const onDraft = vi.fn();
    const hook = renderHook(
        ({ startDate }) => useAutoAssign({ locationId: 5, startDate, demandMap, names: NAMES, onDraft }),
        { initialProps: { startDate: SUN } },
    );
    return { ...hook, onDraft };
};

describe('useAutoAssign', () => {
    it('points to the weekly template when the week needs nobody', async () => {
        const { result } = renderAutoAssign({});
        await act(() => result.current.run());

        expect(generateAutoSchedule).not.toHaveBeenCalled();
        expect(result.current.issue).toMatchObject({ variant: 'info', title: 'לא הוגדר תקן לשבוע זה' });
    });

    it('puts a clean result on the board and reports the score', async () => {
        vi.mocked(generateAutoSchedule).mockResolvedValue(engineResult());
        const { result, onDraft } = renderAutoAssign();
        await act(() => result.current.run());

        expect(generateAutoSchedule).toHaveBeenCalledWith(5, SUN);
        expect(onDraft).toHaveBeenCalledWith(DRAFT, `5|${SUN}`);
        expect(result.current.issue).toBeNull();
        expect(notify.success).toHaveBeenCalledWith('נמצא שיבוץ אופטימלי', expect.stringContaining('4'));
    });

    it('lists the gaps and the inputs the engine set aside', async () => {
        vi.mocked(generateAutoSchedule).mockResolvedValue(engineResult({
            unfilled_slots: [{ shift_id: 1, position_id: 3, date: SUN, missing: 1 }],
            warnings: [{ code: 'employee_skipped_no_positions', employee_id: 8 }],
        }));
        const { result, onDraft } = renderAutoAssign();
        await act(() => result.current.run());

        expect(onDraft).toHaveBeenCalled();
        expect(result.current.issue?.variant).toBe('warning');
        expect(result.current.issue?.items).toHaveLength(2);
        expect(result.current.issue?.items?.[0]).toContain('shift 1 · role 3: חסרים 1');
        expect(result.current.issue?.items?.[1]).toBe('emp 8: אין תפקיד פעיל, ולכן לא שובץ');
    });

    it('keeps the board and explains an infeasible week', async () => {
        vi.mocked(generateAutoSchedule).mockResolvedValue(engineResult({ status: 'FAILED', failure_reason: 'infeasible', draft_assignments: [] }));
        const { result, onDraft } = renderAutoAssign();
        await act(() => result.current.run());

        expect(onDraft).not.toHaveBeenCalled();
        expect(result.current.issue).toMatchObject({ variant: 'error', items: INFEASIBLE_CAUSES });
    });

    it('reports a failed request', async () => {
        vi.mocked(generateAutoSchedule).mockRejectedValue(new Error('offline'));
        const { result } = renderAutoAssign();
        await act(() => result.current.run());

        expect(result.current.issue).toMatchObject({ variant: 'error', title: 'השיבוץ האוטומטי נכשל' });
        expect(result.current.isGenerating).toBe(false);
    });

    it('never shows an explanation that arrives after a week change', async () => {
        let answer!: (value: AutoScheduleResult) => void;
        vi.mocked(generateAutoSchedule).mockReturnValue(new Promise(resolve => { answer = resolve; }));
        const { result, rerender } = renderAutoAssign();

        let running!: Promise<void>;
        act(() => { running = result.current.run(); });
        rerender({ startDate: '2026-12-06' });
        await act(async () => {
            answer(engineResult({ status: 'FAILED', failure_reason: 'time_limit', draft_assignments: [] }));
            await running;
        });

        expect(result.current.issue).toBeNull();
    });
});
