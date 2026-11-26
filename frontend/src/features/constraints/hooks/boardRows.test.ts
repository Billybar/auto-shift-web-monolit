// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { testShift } from '@/test/fixtures';
import type { ConstraintGroup } from '@/types';
import { buildBoardRows, rowHours, rowLabel } from './boardRows';

const group = (id: number, shift_ids: number[], name: string | null = null): ConstraintGroup => ({
    id,
    location_id: 1,
    name,
    shift_ids,
});

const shift = (id: number, start_time: string, end_time: string, name = 'בוקר') =>
    testShift(id, { start_time, end_time, name });

describe('rowLabel', () => {
    it("uses the row's name", () => {
        expect(rowLabel(group(1, [1], 'בקרים'), [shift(1, '07:00', '15:00')])).toBe('בקרים');
    });

    it('joins the shift names when the row has no name', () => {
        const shifts = [shift(1, '07:00', '15:00', 'שומר'), shift(2, '07:00', '15:00', 'אחראי')];
        expect(rowLabel(group(1, [1, 2]), shifts)).toBe('שומר / אחראי');
    });
});

describe('rowHours', () => {
    it('is empty without shifts', () => {
        expect(rowHours([])).toBe('');
    });

    it('gives the shared hours', () => {
        expect(rowHours([shift(1, '07:00', '15:00'), shift(2, '07:00', '15:00')])).toBe('07:00 - 15:00');
    });

    it('runs from the earliest start to the latest end', () => {
        expect(rowHours([shift(1, '07:00', '15:00'), shift(2, '06:00', '14:00')])).toBe('06:00 - 15:00');
    });

    it('counts a shift before 04:00 as after a 22:00 one (the work day)', () => {
        expect(rowHours([shift(1, '22:00', '06:00'), shift(2, '02:00', '10:00')])).toBe('22:00 - 10:00');
    });

    it('ends a row at a shift that crosses midnight', () => {
        expect(rowHours([shift(1, '15:00', '23:00'), shift(2, '19:00', '03:00')])).toBe('15:00 - 03:00');
    });

    it("falls back to the first shift's hours when some hours aren't HH:MM", () => {
        expect(rowHours([shift(1, '07:00', '15:00'), shift(2, 'bad', '')])).toBe('07:00 - 15:00');
    });
});

describe('buildBoardRows', () => {
    const morning = shift(1, '07:00', '15:00');
    const evening = shift(3, '15:00', '23:00', 'ערב');

    it("keeps the groups' order and labels each row", () => {
        const rows = buildBoardRows([morning, evening], [group(2, [3]), group(1, [1])]);

        expect(rows).toEqual([
            { groupId: 2, label: 'ערב', hours: '15:00 - 23:00', shifts: [evening] },
            { groupId: 1, label: 'בוקר', hours: '07:00 - 15:00', shifts: [morning] },
        ]);
    });

    it("leaves out shifts that aren't loaded, and rows left with none", () => {
        const rows = buildBoardRows([morning], [group(1, [1, 99]), group(5, [42])]);

        expect(rows).toEqual([{ groupId: 1, label: 'בוקר', hours: '07:00 - 15:00', shifts: [morning] }]);
    });
});
