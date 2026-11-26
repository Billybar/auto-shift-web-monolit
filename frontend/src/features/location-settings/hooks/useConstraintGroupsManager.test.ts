import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mergeConstraintGroups, renameConstraintGroup, splitConstraintGroup } from '@/api/constraintGroups';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { ConstraintGroup, ConstraintGroupMergeResult, ShiftDefinition } from '@/types';
import type { ConstraintGroupRow } from './useConstraintGroups';
import { useConstraintGroupsManager } from './useConstraintGroupsManager';

// queries.ts reads the module's list fetcher, so it stays real
vi.mock('@/api/constraintGroups', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraintGroups')>()),
    mergeConstraintGroups: vi.fn(),
    renameConstraintGroup: vi.fn(),
    splitConstraintGroup: vi.fn(),
}));

const LOCATION = 3;
const shift = (id: number, name: string) => ({ id, name }) as ShiftDefinition;
const row = (groupId: number, label: string, name: string | null, shifts: ShiftDefinition[]): ConstraintGroupRow => ({
    groupId, label, hours: '', shifts,
    group: { id: groupId, location_id: LOCATION, name, shift_ids: shifts.map(s => s.id) } as ConstraintGroup,
});
const MORNING_A = shift(1, 'בוקר א');
const MORNING_B = shift(2, 'בוקר ב');
const MORNINGS = row(10, 'בקרים', 'בקרים', [MORNING_A, MORNING_B]);
const EVENING = row(20, 'ערב', null, [shift(3, 'ערב')]);

const mergeResult = (conflicts: number) => ({ group: MORNINGS.group, moved: 4, conflicts }) as ConstraintGroupMergeResult;

// The location's shifts and rows, and every cached view of submitted constraints
const ROW_VIEWS = [['shiftDefinitions', LOCATION], ['constraintGroups', LOCATION]];
const CONSTRAINT_VIEWS = [['constraintBoard'], ['employeeConstraints'], ['constraintSubmissions']];

const renderManager = () => {
    const { client, wrapper } = createQueryWrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    return { ...renderHook(() => useConstraintGroupsManager(LOCATION), { wrapper }), invalidate };
};

describe('useConstraintGroupsManager', () => {
    beforeEach(() => {
        vi.mocked(renameConstraintGroup).mockResolvedValue(MORNINGS.group);
        vi.mocked(mergeConstraintGroups).mockResolvedValue(mergeResult(0));
        vi.mocked(splitConstraintGroup).mockResolvedValue(EVENING.group);
    });

    it('renames a row, and an empty name clears it', async () => {
        const { result, invalidate } = renderManager();
        act(() => result.current.editName(MORNINGS.groupId, '  '));

        await act(() => result.current.rename(MORNINGS));

        expect(renameConstraintGroup).toHaveBeenCalledWith(MORNINGS.groupId, '');
        ROW_VIEWS.forEach(queryKey => expect(invalidate).toHaveBeenCalledWith({ queryKey }));
        expect(result.current.nameOf(MORNINGS.groupId, 'בקרים')).toBe('בקרים');
    });

    it("doesn't send an unchanged name", async () => {
        const { result } = renderManager();
        act(() => result.current.editName(EVENING.groupId, ''));

        await act(() => result.current.rename(EVENING));

        expect(renameConstraintGroup).not.toHaveBeenCalled();
    });

    it('keeps the draft when a rename fails', async () => {
        vi.mocked(renameConstraintGroup).mockRejectedValue(new Error('offline'));
        const { result } = renderManager();
        act(() => result.current.editName(EVENING.groupId, 'לילה'));

        await act(() => result.current.rename(EVENING));

        expect(result.current.nameOf(EVENING.groupId, '')).toBe('לילה');
        expect(result.current.issue?.title).toBe('שינוי שם השורה נכשל');
    });

    it('merges rows, refreshes the rows and the constraints, and confirms with a toast', async () => {
        vi.mocked(mergeConstraintGroups).mockResolvedValue(mergeResult(0));
        const { result, invalidate } = renderManager();

        await act(() => result.current.merge(MORNINGS, EVENING));

        expect(mergeConstraintGroups).toHaveBeenCalledWith(MORNINGS.groupId, EVENING.groupId);
        [...ROW_VIEWS, ...CONSTRAINT_VIEWS].forEach(queryKey => expect(invalidate).toHaveBeenCalledWith({ queryKey }));
        expect(notify.success).toHaveBeenCalledWith('השורות אוחדו');
        expect(result.current.issue).toBeNull();
    });

    it('warns when a merge left constraints behind', async () => {
        vi.mocked(mergeConstraintGroups).mockResolvedValue(mergeResult(3));
        const { result } = renderManager();

        await act(() => result.current.merge(MORNINGS, EVENING));

        expect(notify.success).not.toHaveBeenCalled();
        expect(result.current.issue).toMatchObject({ variant: 'warning', title: 'השורות אוחדו, אך חלק מהאילוצים לא הועברו' });
        expect(result.current.issue?.message).toContain('3 אילוצים מהשורה "ערב"');
    });

    it('marks the row while splitting a shift out, then refreshes the constraints', async () => {
        let finish!: () => void;
        vi.mocked(splitConstraintGroup).mockReturnValue(new Promise(resolve => { finish = () => resolve(EVENING.group); }));
        const { result, invalidate } = renderManager();

        let splitting!: Promise<void>;
        act(() => { splitting = result.current.split(MORNINGS, MORNING_B); });
        await vi.waitFor(() => expect(result.current.busyId).toBe(MORNINGS.groupId));

        await act(async () => { finish(); await splitting; });

        expect(splitConstraintGroup).toHaveBeenCalledWith(MORNINGS.groupId, MORNING_B.id);
        CONSTRAINT_VIEWS.forEach(queryKey => expect(invalidate).toHaveBeenCalledWith({ queryKey }));
        expect(notify.success).toHaveBeenCalledWith('המשמרת הופרדה לשורה נפרדת');
        await vi.waitFor(() => expect(result.current.busyId).toBeNull());
    });

    it('shows a failed split as an error issue', async () => {
        vi.mocked(splitConstraintGroup).mockRejectedValue(new Error('offline'));
        const { result, invalidate } = renderManager();

        await act(() => result.current.split(MORNINGS, MORNING_B));

        expect(result.current.issue).toMatchObject({ variant: 'error', title: 'הפרדת המשמרת נכשלה' });
        expect(invalidate).not.toHaveBeenCalled();
    });
});
