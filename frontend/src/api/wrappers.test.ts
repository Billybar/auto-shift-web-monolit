// @vitest-environment node
// The per-resource wrappers: each sends one request through apiClient and returns its data
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserRole } from '@/types';
import type { Assignment } from '@/types';
import * as admin from './admin';
import * as assignments from './assignments';
import * as auth from './auth';
import { apiClient } from './client';
import * as constraintGroups from './constraintGroups';
import * as constraints from './constraints';
import * as demo from './demo';
import * as employees from './employees';
import * as locations from './locations';
import * as positions from './positions';
import * as shiftDefinitions from './shiftDefinitions';

vi.mock('./client', () => ({
    apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

type Method = 'get' | 'post' | 'put' | 'delete';
const METHODS: Method[] = ['get', 'post', 'put', 'delete'];

const RESULT = { from: 'server' };
// Any request body; the wrappers pass it through unchanged
const BODY = { name: 'x' } as never;
const WEEK = '2026-10-25';
const WEEK_END = '2026-10-31';
const LIST = { params: { limit: 1000 } };

const request = (method: Method) => vi.mocked(apiClient[method]);

// [wrapper, call, method, the arguments apiClient gets]
const ROWS: [string, () => Promise<unknown>, Method, unknown[]][] = [
    ['admin.getOrganizations', () => admin.getOrganizations(), 'get', ['/api/organizations/', LIST]],
    ['admin.createOrganization', () => admin.createOrganization(BODY), 'post', ['/api/organizations/', BODY]],
    ['admin.getClients', () => admin.getClients(), 'get', ['/api/clients/', LIST]],
    ['admin.createClient', () => admin.createClient(BODY), 'post', ['/api/clients/', BODY]],
    ['admin.getAllLocations', () => admin.getAllLocations(), 'get', ['/api/locations/', LIST]],
    ['admin.createLocation', () => admin.createLocation(BODY), 'post', ['/api/locations/', BODY]],
    ['admin.getStaffUsers', () => admin.getStaffUsers(), 'get', ['/api/users/', { params: { limit: 1000, staff_only: true } }]],
    ['admin.createStaffUser', () => admin.createStaffUser(BODY), 'post', ['/api/users/', BODY]],
    ['admin.updateStaffUser', () => admin.updateStaffUser(3, BODY), 'put', ['/api/users/3', BODY]],
    ['admin.deleteStaffUser', () => admin.deleteStaffUser(3), 'delete', ['/api/users/3']],

    ['assignments.getAssignments', () => assignments.getAssignments(5, WEEK, WEEK_END), 'get',
        ['/api/assignments/', { params: { location_id: 5, start_date: WEEK, end_date: WEEK_END } }]],
    ['assignments.generateAutoSchedule', () => assignments.generateAutoSchedule(5, WEEK), 'post',
        ['/api/assignments/auto-generate/5', null, { params: { start_date: WEEK }, timeout: 300_000 }]],
    ['assignments.getSchedulePublication', () => assignments.getSchedulePublication(5, WEEK), 'get',
        ['/api/assignments/publication', { params: { location_id: 5, week_start_date: WEEK } }]],
    ['assignments.setSchedulePublication', () => assignments.setSchedulePublication(5, WEEK, true), 'put',
        ['/api/assignments/publication', { location_id: 5, week_start_date: WEEK, is_published: true }]],

    ['auth.refreshToken', () => auth.refreshToken(), 'post', ['/api/auth/refresh']],
    ['auth.requestPasswordReset', () => auth.requestPasswordReset(BODY), 'post', ['/api/auth/forgot-password', BODY]],
    ['auth.confirmPasswordReset', () => auth.confirmPasswordReset(BODY), 'post', ['/api/auth/reset-password', BODY]],

    ['constraintGroups.getConstraintGroups', () => constraintGroups.getConstraintGroups(5), 'get',
        ['/api/constraint-groups/', { params: { location_id: 5 } }]],
    ['constraintGroups.renameConstraintGroup', () => constraintGroups.renameConstraintGroup(2, 'לילה'), 'put',
        ['/api/constraint-groups/2', { name: 'לילה' }]],
    ['constraintGroups.mergeConstraintGroups', () => constraintGroups.mergeConstraintGroups(2, 3), 'post',
        ['/api/constraint-groups/2/merge', { source_group_id: 3 }]],
    ['constraintGroups.splitConstraintGroup', () => constraintGroups.splitConstraintGroup(2, 4), 'post',
        ['/api/constraint-groups/2/split', { shift_id: 4 }]],

    ['constraints.getEmployeeConstraints', () => constraints.getEmployeeConstraints(7, WEEK, WEEK_END), 'get',
        ['/api/constraints/', { params: { employee_id: 7, start_date: WEEK, end_date: WEEK_END } }]],
    ['constraints.syncEmployeeConstraints', () => constraints.syncEmployeeConstraints(7, WEEK, WEEK_END, BODY), 'post',
        ['/api/constraints/sync', BODY, { params: { employee_id: 7, start_date: WEEK, end_date: WEEK_END } }]],
    ['constraints.getDefaultConstraints', () => constraints.getDefaultConstraints(7), 'get',
        ['/api/constraints/defaults', { params: { employee_id: 7 } }]],
    ['constraints.saveDefaultConstraints', () => constraints.saveDefaultConstraints(7, []), 'put',
        ['/api/constraints/defaults', { constraints: [] }, { params: { employee_id: 7 } }]],
    ['constraints.getConstraintSubmissionStatus', () => constraints.getConstraintSubmissionStatus(5, WEEK), 'get',
        ['/api/constraints/submission-status', { params: { location_id: 5, week_start: WEEK } }]],

    ['demo.getDemoStatus', () => demo.getDemoStatus(), 'get', ['/api/demo/status']],
    ['demo.startDemoSession', () => demo.startDemoSession(), 'post', ['/api/demo/session']],
    ['demo.switchDemoRole', () => demo.switchDemoRole('employee'), 'post', ['/api/demo/switch', { role: 'employee' }]],

    ['employees.getEmployeesByLocation', () => employees.getEmployeesByLocation(5), 'get',
        ['/api/employees/', { params: { location_id: 5 } }]],
    ['employees.createEmployee', () => employees.createEmployee(BODY), 'post', ['/api/employees/', BODY]],
    ['employees.updateEmployee', () => employees.updateEmployee(7, BODY), 'put', ['/api/employees/7', BODY]],
    ['employees.deleteEmployee', () => employees.deleteEmployee(7), 'delete', ['/api/employees/7']],
    ['employees.updateEmployeeSettings', () => employees.updateEmployeeSettings(7, BODY), 'put', ['/api/employees/7/settings', BODY]],

    ['locations.getLocationWeights', () => locations.getLocationWeights(5), 'get', ['/api/locations/5/weights']],
    ['locations.updateLocationWeights', () => locations.updateLocationWeights(5, BODY), 'put', ['/api/locations/5/weights', BODY]],
    ['locations.getDemandTemplate', () => locations.getDemandTemplate(5), 'get', ['/api/locations/5/demand-template']],
    ['locations.updateDemandTemplate', () => locations.updateDemandTemplate(5, []), 'put',
        ['/api/locations/5/demand-template', { cells: [] }]],

    ['positions.getPositions', () => positions.getPositions(5), 'get',
        ['/api/positions/', { params: { location_id: 5, include_archived: false } }]],
    ['positions.getPositions (archived too)', () => positions.getPositions(5, true), 'get',
        ['/api/positions/', { params: { location_id: 5, include_archived: true } }]],
    ['positions.createPosition', () => positions.createPosition(BODY), 'post', ['/api/positions/', BODY]],
    ['positions.updatePosition', () => positions.updatePosition(3, BODY), 'put', ['/api/positions/3', BODY]],
    ['positions.deletePosition', () => positions.deletePosition(3), 'delete', ['/api/positions/3']],

    ['shiftDefinitions.getShiftDefinitions', () => shiftDefinitions.getShiftDefinitions(5), 'get',
        ['/api/shift-definitions/', { params: { location_id: 5 } }]],
    ['shiftDefinitions.createShiftDefinition', () => shiftDefinitions.createShiftDefinition(BODY), 'post',
        ['/api/shift-definitions/', BODY]],
    ['shiftDefinitions.updateShiftDefinition', () => shiftDefinitions.updateShiftDefinition(1, BODY), 'put',
        ['/api/shift-definitions/1', BODY]],
    ['shiftDefinitions.deleteShiftDefinition', () => shiftDefinitions.deleteShiftDefinition(1), 'delete',
        ['/api/shift-definitions/1']],
    ['shiftDefinitions.getWeeklyDemand', () => shiftDefinitions.getWeeklyDemand(5, WEEK), 'get',
        ['/api/shift-definitions/weekly-demand', { params: { location_id: 5, start_date: WEEK } }]],
    ['shiftDefinitions.setShiftDemandOverride', () => shiftDefinitions.setShiftDemandOverride(1, WEEK, 3, 2), 'put',
        [`/api/shift-definitions/1/demand-overrides/${WEEK}`, { position_id: 3, required_employees: 2 }]],
];

describe('api wrappers', () => {
    beforeEach(() => {
        METHODS.forEach(method => request(method).mockResolvedValue({ data: RESULT }));
    });

    it.each(ROWS)('%s', async (_name, call, method, args) => {
        const value = await call();

        expect(request(method)).toHaveBeenCalledOnce();
        expect(request(method)).toHaveBeenCalledWith(...args);
        METHODS.filter(m => m !== method).forEach(m => expect(request(m)).not.toHaveBeenCalled());
        expect(value).toBe(method === 'delete' ? undefined : RESULT);
    });

    describe('locations.getAllowedLocations', () => {
        it("gives staff the server's scoped list", async () => {
            expect(await locations.getAllowedLocations(UserRole.SCHEDULER)).toBe(RESULT);
            expect(apiClient.get).toHaveBeenCalledWith('/api/locations/');
        });

        it("gives an employee the locations of their own account", async () => {
            const own = [{ id: 1, name: 'Site 1', client_id: 1 }];
            vi.mocked(apiClient.get).mockResolvedValue({ data: { locations: own } });

            expect(await locations.getAllowedLocations(UserRole.EMPLOYEE)).toBe(own);
            expect(apiClient.get).toHaveBeenCalledWith('/api/users/me');
        });

        it('gives an employee without locations an empty list', async () => {
            vi.mocked(apiClient.get).mockResolvedValue({ data: {} });

            expect(await locations.getAllowedLocations(UserRole.EMPLOYEE)).toEqual([]);
        });
    });

    it('auth.loginUser sends a form-encoded body', async () => {
        expect(await auth.loginUser('dana@example.com', 'secret')).toBe(RESULT);

        const [path, body, config] = vi.mocked(apiClient.post).mock.calls[0];
        expect(path).toBe('/api/auth/login');
        expect(String(body)).toBe('username=dana%40example.com&password=secret');
        expect(config).toEqual({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    });

    it('constraints.importConstraintsFromHtml uploads the file as multipart form data', async () => {
        const file = new File(['<html></html>'], 'export.html', { type: 'text/html' });

        expect(await constraints.importConstraintsFromHtml(file, 'yalam', WEEK, 5)).toBe(RESULT);

        const [path, body, config] = vi.mocked(apiClient.post).mock.calls[0];
        expect(path).toBe('/api/constraints/import-html');
        const form = body as FormData;
        expect((form.get('file') as File).name).toBe('export.html');
        expect(form.get('source')).toBe('yalam');
        expect(form.get('start_of_week')).toBe(WEEK);
        expect(form.get('location_id')).toBe('5');
        expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 });
    });

    describe('assignments sent to the server', () => {
        // UI-only fields (id, location_id) stay out of the payload
        const ASSIGNMENT: Assignment = {
            id: 9, location_id: 5, employee_id: 7, shift_id: 1, position_id: 3, date: WEEK, start_time: '07:00', end_time: null,
        };
        const PAYLOAD = [{ employee_id: 7, shift_id: 1, position_id: 3, date: WEEK, start_time: '07:00', end_time: null }];

        it('saveAssignments syncs the week', async () => {
            expect(await assignments.saveAssignments(5, WEEK, WEEK_END, [ASSIGNMENT])).toBe(RESULT);
            expect(apiClient.post).toHaveBeenCalledWith('/api/assignments/', PAYLOAD, {
                params: { location_id: 5, start_date: WEEK, end_date: WEEK_END },
            });
        });

        it('checkSchedule checks the board', async () => {
            expect(await assignments.checkSchedule(5, WEEK, [ASSIGNMENT])).toBe(RESULT);
            expect(apiClient.post).toHaveBeenCalledWith('/api/assignments/check/5', PAYLOAD, {
                params: { start_date: WEEK },
            });
        });
    });
});
