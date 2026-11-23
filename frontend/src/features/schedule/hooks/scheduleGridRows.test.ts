import { describe, expect, it } from 'vitest';

import type { Assignment, Position, ShiftDayDemand, ShiftDefinition } from '../../../types';
import { buildRoleGroups, groupByCell, manualRowsKey } from './scheduleGridRows';
import { demandKey } from './useWeeklyDemand';

const SUN = '2026-11-29';
const MON = '2026-11-30';
const SAT = '2026-11-28';
const MORNING = { id: 1, name: 'בוקר' } as ShiftDefinition;
const EVENING = { id: 2, name: 'ערב' } as ShiftDefinition;
const position = (id: number, is_active = true) => ({ id, name: `role ${id}`, is_active }) as Position;
const GUARD = position(3);
const SUPERVISOR = position(4);
const ARCHIVED = position(5, false);

const demand = (shift: number, date: string, positionId: number, required: number): Record<string, ShiftDayDemand> => ({
    [demandKey(shift, date, positionId)]: { shift_id: shift, date, position_id: positionId, required_employees: required, is_override: false },
});
const assignment = (employee_id: number, shift_id: number, date: string, position_id: number): Assignment =>
    ({ employee_id, shift_id, date, position_id });

const build = (input: Partial<Parameters<typeof buildRoleGroups>[0]>) => buildRoleGroups({
    shifts: [MORNING],
    positions: [GUARD, SUPERVISOR],
    dateStrs: [SUN, MON],
    demandMap: {},
    assignmentsByCell: {},
    manualRows: {},
    ...input,
});

const rowsOf = (groups: ReturnType<typeof buildRoleGroups>, shiftId: number) =>
    groups[shiftId].map(g => [g.position.id, g.rows, g.baseRows]);

describe('groupByCell', () => {
    it('groups by shift, date and role, keeping the order', () => {
        const list = [assignment(7, 1, SUN, 3), assignment(8, 1, MON, 3), assignment(9, 1, SUN, 3)];
        expect(groupByCell(list)[demandKey(1, SUN, 3)].map(a => a.employee_id)).toEqual([7, 9]);
    });
});

describe('buildRoleGroups', () => {
    it("gives each role as many rows as its busiest day's demand", () => {
        const groups = build({ demandMap: { ...demand(1, SUN, 3, 1), ...demand(1, MON, 3, 3) } });
        expect(rowsOf(groups, 1)).toEqual([[3, 3, 3]]);
    });

    it('adds rows for people above the demand', () => {
        const byCell = groupByCell([assignment(7, 1, SUN, 4), assignment(8, 1, SUN, 4)]);
        const groups = build({ demandMap: demand(1, SUN, 4, 1), assignmentsByCell: byCell });
        expect(rowsOf(groups, 1)).toEqual([[4, 2, 2]]);
    });

    it('shows one row of the first active role for a shift that needs nobody', () => {
        const groups = build({ shifts: [MORNING, EVENING], positions: [ARCHIVED, GUARD], demandMap: demand(1, SUN, 3, 2) });
        expect(rowsOf(groups, 2)).toEqual([[3, 1, 1]]);
    });

    it("ignores an archived role's demand, but keeps rows for its people", () => {
        const byCell = groupByCell([assignment(7, 1, SUN, 5)]);
        const groups = build({ positions: [GUARD, ARCHIVED], demandMap: demand(1, MON, 5, 4), assignmentsByCell: byCell });
        expect(rowsOf(groups, 1)).toEqual([[5, 1, 1]]);
    });

    it('counts the people of the day before the week', () => {
        const previousDay = { dateStr: SAT, assignmentsByCell: groupByCell([assignment(7, 1, SAT, 3), assignment(8, 1, SAT, 3)]) };
        expect(rowsOf(build({ previousDay }), 1)).toEqual([[3, 2, 2]]);
    });

    it('treats rows added from the shift menu as a floor', () => {
        const manualRows = { [manualRowsKey(1, 3)]: 2 };
        expect(rowsOf(build({ demandMap: demand(1, SUN, 3, 1), manualRows }), 1)).toEqual([[3, 2, 1]]);
        expect(rowsOf(build({ demandMap: demand(1, SUN, 3, 3), manualRows }), 1)).toEqual([[3, 3, 3]]);
    });
});
