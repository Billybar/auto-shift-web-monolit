import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Employee } from '@/types';
import { useEmployeeSort } from './useEmployeeSort';

const employee = (id: number, first: string, is_active = true) =>
    ({ id, is_active, user: { first_name: first, last_name: '' } }) as unknown as Employee;

const EMPLOYEES = [employee(3, 'בני'), employee(1, 'גלית', false), employee(2, 'אבי'), employee(4, 'דנה')];
const ids = (list: Employee[]) => list.map(e => e.id);

describe('useEmployeeSort', () => {
    it('sorts by id, active employees first', () => {
        const { result } = renderHook(() => useEmployeeSort(EMPLOYEES));
        expect(ids(result.current.sorted)).toEqual([2, 3, 4, 1]);
    });

    it('sorts by Hebrew name, and flips on a second click', () => {
        const { result } = renderHook(() => useEmployeeSort(EMPLOYEES));

        act(() => result.current.toggleSort('name'));
        expect(ids(result.current.sorted)).toEqual([2, 3, 4, 1]);
        expect(result.current.sortDir).toBe('asc');

        act(() => result.current.toggleSort('name'));
        expect(ids(result.current.sorted)).toEqual([4, 3, 2, 1]);
    });

    it('sorts another column ascending', () => {
        const { result } = renderHook(() => useEmployeeSort(EMPLOYEES));
        act(() => result.current.toggleSort('id'));
        expect(result.current.sortDir).toBe('desc');

        act(() => result.current.toggleSort('name'));
        expect(result.current.sortKey).toBe('name');
        expect(result.current.sortDir).toBe('asc');
    });
});
