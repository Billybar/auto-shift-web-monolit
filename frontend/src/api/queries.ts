// src/api/queries.ts
// Query keys and fetchers for data that more than one screen reads, so they share one cached copy.
// A query that takes an id is disabled until the id is set. Data shaped for one screen stays in that
// screen's hook.
import { queryOptions } from '@tanstack/react-query';
import { getAllLocations, getClients, getOrganizations, getStaffUsers } from './admin';
import { getSchedulePublication } from './assignments';
import { getConstraintGroups } from './constraintGroups';
import { getConstraintSubmissionStatus, getDefaultConstraints, getEmployeeConstraints } from './constraints';
import { getDemoStatus } from './demo';
import { getEmployeesByLocation } from './employees';
import { getAllowedLocations, getDemandTemplate } from './locations';
import { getPositions } from './positions';
import { getShiftDefinitions } from './shiftDefinitions';
import type { User } from '../types';

// --- Account ---

/** The header's location picker. Keyed by the account, whose role picks the endpoint. */
export const allowedLocationsQuery = (user: Pick<User, 'email' | 'role'> | null) => queryOptions({
    queryKey: ['locations', 'allowed', user?.email ?? null, user?.role ?? null],
    queryFn: () => getAllowedLocations(user!.role),
    enabled: !!user,
});

/** Whether this instance is the public demo. It never changes while the app runs. */
export const demoStatusQuery = () => queryOptions({
    queryKey: ['demo', 'status'],
    queryFn: getDemoStatus,
    staleTime: Infinity,
});

// --- Admin dashboard ---

export const organizationsQuery = () => queryOptions({ queryKey: ['admin', 'organizations'], queryFn: getOrganizations });
export const clientsQuery = () => queryOptions({ queryKey: ['admin', 'clients'], queryFn: getClients });
export const adminLocationsQuery = () => queryOptions({ queryKey: ['admin', 'locations'], queryFn: getAllLocations });
export const staffUsersQuery = () => queryOptions({ queryKey: ['admin', 'staffUsers'], queryFn: getStaffUsers });

// --- A location ---

export const shiftDefinitionsQuery = (locationId: number | null) => queryOptions({
    queryKey: ['shiftDefinitions', locationId],
    queryFn: () => getShiftDefinitions(locationId!),
    enabled: !!locationId,
});

/** The rows of the location's constraints board. */
export const constraintGroupsQuery = (locationId: number | null) => queryOptions({
    queryKey: ['constraintGroups', locationId],
    queryFn: () => getConstraintGroups(locationId!),
    enabled: !!locationId,
});

/** The location's roles, archived ones included (they label past assignments). */
export const positionsQuery = (locationId: number | null) => queryOptions({
    queryKey: ['positions', locationId],
    queryFn: () => getPositions(locationId!, true),
    enabled: !!locationId,
});

export const employeesQuery = (locationId: number | null) => queryOptions({
    queryKey: ['employees', locationId],
    queryFn: () => getEmployeesByLocation(locationId!),
    enabled: !!locationId,
});

export const demandTemplateQuery = (locationId: number | null) => queryOptions({
    queryKey: ['demandTemplate', locationId],
    queryFn: () => getDemandTemplate(locationId!),
    enabled: !!locationId,
});

// --- A location's week ---

export const publicationQuery = (locationId: number | null, weekStart: string) => queryOptions({
    queryKey: ['publication', locationId, weekStart],
    queryFn: () => getSchedulePublication(locationId!, weekStart),
    enabled: !!locationId,
});

/** Every week's submission status starts with this key. */
export const constraintSubmissionsKey = ['constraintSubmissions'] as const;

/** The employees who haven't submitted constraints for the week. */
export const constraintSubmissionsQuery = (locationId: number | null, weekStart: string) => queryOptions({
    queryKey: [...constraintSubmissionsKey, locationId, weekStart],
    queryFn: () => getConstraintSubmissionStatus(locationId!, weekStart),
    enabled: !!locationId,
});

// --- An employee ---

/** Every week of the employee's constraints, as the API returns them, starts with this key. */
export const employeeConstraintsKey = (employeeId: number) => ['employeeConstraints', employeeId] as const;

/** One week of the employee's constraints, as the API returns them (one per shift of a board row). */
export const employeeConstraintsQuery = (employeeId: number, startDate: string, endDate: string) => queryOptions({
    queryKey: [...employeeConstraintsKey(employeeId), startDate, endDate],
    queryFn: () => getEmployeeConstraints(employeeId, startDate, endDate),
});

/** The employee's default week ("אילוצים קבועים"). */
export const defaultConstraintsQuery = (employeeId: number | undefined) => queryOptions({
    queryKey: ['defaultConstraints', employeeId ?? null],
    queryFn: () => getDefaultConstraints(employeeId!),
    enabled: !!employeeId,
});
