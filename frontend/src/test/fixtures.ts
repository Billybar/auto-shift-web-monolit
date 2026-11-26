// src/test/fixtures.ts
// Complete, valid records for tests; pass only the fields a test cares about
import { UserRole } from '@/types';
import type { Employee, LocationData, Position, ShiftDefinition, User } from '@/types';

export const testUser = (role: UserRole = UserRole.SCHEDULER, overrides: Partial<User> = {}): User => ({
    email: `${role}@example.com`,
    first_name: 'דנה',
    last_name: 'כהן',
    role,
    employee_id: 1,
    ...overrides,
});

export const testLocation = (id: number, overrides: Partial<LocationData> = {}): LocationData => ({
    id,
    name: `Site ${id}`,
    client_id: 1,
    ...overrides,
});

export const testShift = (id: number, overrides: Partial<ShiftDefinition> = {}): ShiftDefinition => ({
    id,
    name: 'בוקר',
    start_time: '07:00',
    end_time: '15:00',
    location_id: 1,
    constraint_group_id: id,
    category: 'morning',
    ...overrides,
});

export const testPosition = (id: number, overrides: Partial<Position> = {}): Position => ({
    id,
    location_id: 1,
    name: `role ${id}`,
    color: '94A3B8',
    sort_order: id,
    is_active: true,
    ...overrides,
});

export const testEmployee = (id: number, overrides: Partial<Employee> = {}): Employee => ({
    id,
    user: { id: 100 + id, email: `employee${id}@example.com`, first_name: 'עובד', last_name: String(id), created_at: '2026-01-01T00:00:00' },
    location_id: 1,
    color: '3b82f6',
    is_active: true,
    position_ids: [],
    primary_position_id: null,
    ...overrides,
});
