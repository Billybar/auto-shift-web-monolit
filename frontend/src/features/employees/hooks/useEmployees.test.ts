import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getEmployeesByLocation } from '@/api/employees';
import { apiError } from '@/test/apiErrors';
import { testEmployee } from '@/test/fixtures';
import { createQueryWrapper } from '@/test/queryWrapper';
import { useEmployees } from './useEmployees';

vi.mock('@/api/employees', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/employees')>()),
    getEmployeesByLocation: vi.fn(),
}));

const EMPLOYEES = [testEmployee(1), testEmployee(2, { is_active: false })];

const renderEmployees = (locationId: number | null = 5) => {
    const { wrapper } = createQueryWrapper();
    return renderHook(() => useEmployees(locationId), { wrapper });
};

describe('useEmployees', () => {
    beforeEach(() => {
        vi.mocked(getEmployeesByLocation).mockResolvedValue(EMPLOYEES);
    });

    it("loads the location's employees, inactive ones included", async () => {
        const { result } = renderEmployees();

        await waitFor(() => expect(result.current.employees).toEqual(EMPLOYEES));
        expect(getEmployeesByLocation).toHaveBeenCalledWith(5);
        expect(result.current.loadError).toBeNull();
    });

    it('fetches nothing without a location', () => {
        const { result } = renderEmployees(null);

        expect(getEmployeesByLocation).not.toHaveBeenCalled();
        expect(result.current).toMatchObject({ employees: [], isLoading: false, loadError: null });
    });

    it('reports a failed load', async () => {
        vi.mocked(getEmployeesByLocation).mockRejectedValue(apiError(500));
        const { result } = renderEmployees();

        await waitFor(() => expect(result.current.loadError).not.toBeNull());
        expect(result.current.employees).toEqual([]);
    });

    it('reloads', async () => {
        const { result } = renderEmployees();
        await waitFor(() => expect(result.current.employees).toHaveLength(2));

        await act(() => result.current.reload());

        expect(getEmployeesByLocation).toHaveBeenCalledTimes(2);
    });
});
