// src/features/constraints/hooks/constraintCaches.ts
import type { QueryClient } from '@tanstack/react-query';

import { allEmployeeConstraintsKey, constraintSubmissionsKey } from '@/api/queries';
import { allConstraintBoardsKey } from './useWeeklyConstraints';

/**
 * Refreshes every cached view of submitted constraints: the employees' boards, the constraints the
 * schedule's sidebar shows, and who has submitted. Call after a change that writes many employees'
 * constraints at once (an import, merging or splitting board rows).
 */
export const invalidateConstraintViews = (queryClient: QueryClient) => Promise.all([
    queryClient.invalidateQueries({ queryKey: allConstraintBoardsKey }),
    queryClient.invalidateQueries({ queryKey: allEmployeeConstraintsKey }),
    queryClient.invalidateQueries({ queryKey: constraintSubmissionsKey }),
]);
