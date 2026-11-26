import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getConstraintGroups } from '@/api/constraintGroups';
import { getShiftDefinitions } from '@/api/shiftDefinitions';
import { testShift } from '@/test/fixtures';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { ConstraintGroup } from '@/types';
import { useConstraintGroups } from './useConstraintGroups';

vi.mock('@/api/shiftDefinitions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/shiftDefinitions')>()),
    getShiftDefinitions: vi.fn(),
}));
vi.mock('@/api/constraintGroups', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraintGroups')>()),
    getConstraintGroups: vi.fn(),
}));

const SHIFTS = [testShift(1, { name: 'שומר' }), testShift(2, { name: 'אחראי' })];
const MERGED: ConstraintGroup = { id: 1, location_id: 5, name: 'בקרים', shift_ids: [1, 2] };

const renderGroups = () => {
    const { wrapper } = createQueryWrapper();
    return renderHook(() => useConstraintGroups(5), { wrapper });
};

describe('useConstraintGroups', () => {
    beforeEach(() => {
        vi.mocked(getShiftDefinitions).mockResolvedValue(SHIFTS);
        vi.mocked(getConstraintGroups).mockResolvedValue([MERGED]);
    });

    it('gives each row with its group and shifts', async () => {
        const { result } = renderGroups();

        await waitFor(() => expect(result.current.rows).toHaveLength(1));
        expect(result.current.rows[0]).toEqual({
            groupId: 1,
            label: 'בקרים',
            hours: '07:00 - 15:00',
            shifts: SHIFTS,
            group: MERGED,
        });
        expect(result.current.loadError).toBeNull();
    });

    it('has no rows until both lists load', async () => {
        vi.mocked(getConstraintGroups).mockReturnValue(new Promise(() => {}));
        const { result } = renderGroups();

        await waitFor(() => expect(getShiftDefinitions).toHaveBeenCalled());
        expect(result.current.rows).toEqual([]);
        expect(result.current.isLoading).toBe(true);
    });

    it('reloads both lists', async () => {
        const { result } = renderGroups();
        await waitFor(() => expect(result.current.rows).toHaveLength(1));

        await act(() => result.current.reload());

        expect(getShiftDefinitions).toHaveBeenCalledTimes(2);
        expect(getConstraintGroups).toHaveBeenCalledTimes(2);
    });
});
