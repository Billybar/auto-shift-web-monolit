// src/features/employees/hooks/useEmployeeSort.ts
import { useMemo, useState } from 'react';
import type { Employee } from '../../../types';

export type SortKey = 'id' | 'name';
export type SortDir = 'asc' | 'desc';

export const getFullName = (emp: Employee): string =>
    `${emp.user?.first_name ?? ''} ${emp.user?.last_name ?? ''}`.trim();

/** Active employees first; the chosen column sorts within each group (ties by id). */
export const sortEmployees = (employees: Employee[], key: SortKey, dir: SortDir): Employee[] => {
    const sign = dir === 'asc' ? 1 : -1;
    return [...employees].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        if (key === 'name') {
            const byName = getFullName(a).localeCompare(getFullName(b), 'he');
            if (byName !== 0) return byName * sign;
        }
        return (a.id - b.id) * sign;
    });
};

/** The employees table's sort: clicking the sorted column flips it, another column sorts ascending. */
export function useEmployeeSort(employees: Employee[]) {
    const [sortKey, setSortKey] = useState<SortKey>('id');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const sorted = useMemo(() => sortEmployees(employees, sortKey, sortDir), [employees, sortKey, sortDir]);

    const toggleSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    return { sorted, sortKey, sortDir, toggleSort };
}
