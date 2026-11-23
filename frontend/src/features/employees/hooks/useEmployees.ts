// src/features/employees/hooks/useEmployees.ts
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { employeesQuery } from '../../../api/queries';
import { loadStatus } from '../../../api/query';
import type { Employee } from '../../../types';

const NO_EMPLOYEES: Employee[] = [];

/** The location's employees, inactive ones included. `reload` refreshes them after a save or delete. */
export function useEmployees(locationId: number | null) {
    const query = useQuery(employeesQuery(locationId));
    const { refetch } = query;
    const reload = useCallback(async () => { await refetch(); }, [refetch]);

    return { employees: query.data ?? NO_EMPLOYEES, ...loadStatus(query), reload };
}
