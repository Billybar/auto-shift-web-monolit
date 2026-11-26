import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getConstraintGroups } from '@/api/constraintGroups';
import { getShiftDefinitions } from '@/api/shiftDefinitions';
import { apiError } from '@/test/apiErrors';
import { testShift } from '@/test/fixtures';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { ConstraintGroup } from '@/types';
import { useShiftDefinitions } from './useShiftDefinitions';

vi.mock('@/api/shiftDefinitions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/shiftDefinitions')>()),
    getShiftDefinitions: vi.fn(),
}));
vi.mock('@/api/constraintGroups', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraintGroups')>()),
    getConstraintGroups: vi.fn(),
}));

const SHIFTS = [testShift(1), testShift(2, { name: 'ערב', start_time: '15:00', end_time: '23:00' })];
const GROUPS: ConstraintGroup[] = [
    { id: 1, location_id: 5, name: null, shift_ids: [1] },
    { id: 2, location_id: 5, name: null, shift_ids: [2] },
];

const renderShifts = (locationId: number | null = 5) => {
    const { wrapper } = createQueryWrapper();
    return renderHook(() => useShiftDefinitions(locationId), { wrapper });
};

describe('useShiftDefinitions', () => {
    beforeEach(() => {
        vi.mocked(getShiftDefinitions).mockResolvedValue(SHIFTS);
        vi.mocked(getConstraintGroups).mockResolvedValue(GROUPS);
    });

    it('fetches nothing without a location', () => {
        const { result } = renderShifts(null);

        expect(getShiftDefinitions).not.toHaveBeenCalled();
        expect(getConstraintGroups).not.toHaveBeenCalled();
        expect(result.current).toMatchObject({ shifts: [], rows: [], isLoadingShifts: false, shiftsError: null });
    });

    it("gives the location's shifts and board rows", async () => {
        const { result } = renderShifts();

        await waitFor(() => expect(result.current.rows).toHaveLength(2));
        expect(getShiftDefinitions).toHaveBeenCalledWith(5);
        expect(getConstraintGroups).toHaveBeenCalledWith(5);
        expect(result.current.shifts).toEqual(SHIFTS);
        expect(result.current.rows.map(r => r.label)).toEqual(['בוקר', 'ערב']);
        expect(result.current.shiftsError).toBeNull();
    });

    it.each([
        ['shifts', getShiftDefinitions],
        ['board rows', getConstraintGroups],
    ] as const)('gives an error message when the %s fail to load', async (_name, fetcher) => {
        vi.mocked(fetcher).mockRejectedValue(apiError(500));
        const { result } = renderShifts();

        await waitFor(() => expect(result.current.shiftsError).toBe('שגיאה בטעינת סוגי המשמרות. אנא נסה שוב.'));
        expect(result.current.rows).toEqual([]);
    });
});
