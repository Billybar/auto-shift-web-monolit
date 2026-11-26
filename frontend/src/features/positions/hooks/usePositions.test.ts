import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPositions } from '@/api/positions';
import { apiError } from '@/test/apiErrors';
import { testPosition } from '@/test/fixtures';
import { createQueryWrapper } from '@/test/queryWrapper';
import { usePositions } from './usePositions';

vi.mock('@/api/positions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/positions')>()),
    getPositions: vi.fn(),
}));

const GUARD = testPosition(1);
const ARCHIVED = testPosition(2, { is_active: false });

const renderPositions = (locationId: number | null = 5) => {
    const { wrapper } = createQueryWrapper();
    return renderHook(() => usePositions(locationId), { wrapper });
};

describe('usePositions', () => {
    beforeEach(() => {
        vi.mocked(getPositions).mockResolvedValue([GUARD, ARCHIVED]);
    });

    it("loads the location's roles, archived ones included", async () => {
        const { result } = renderPositions();

        await waitFor(() => expect(result.current.positions).toHaveLength(2));
        expect(getPositions).toHaveBeenCalledWith(5, true);
        expect(result.current.activePositions).toEqual([GUARD]);
        expect(result.current.positionsById).toEqual({ 1: GUARD, 2: ARCHIVED });
    });

    it('fetches nothing without a location', () => {
        const { result } = renderPositions(null);

        expect(getPositions).not.toHaveBeenCalled();
        expect(result.current).toMatchObject({ positions: [], activePositions: [], positionsById: {}, isLoading: false });
    });

    it('reports a failed load', async () => {
        vi.mocked(getPositions).mockRejectedValue(apiError(500));
        const { result } = renderPositions();

        await waitFor(() => expect(result.current.loadError).not.toBeNull());
        expect(result.current.positions).toEqual([]);
    });

    it('reloads', async () => {
        const { result } = renderPositions();
        await waitFor(() => expect(result.current.positions).toHaveLength(2));

        await act(() => result.current.reload());

        expect(getPositions).toHaveBeenCalledTimes(2);
    });
});
