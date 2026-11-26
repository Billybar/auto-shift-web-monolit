// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { ConstraintType } from '@/types';
import { nextMark, toggleInList } from './tapCycle';

describe('nextMark', () => {
    it('cycles an employee through cannot_work and prefer_to', () => {
        expect(nextMark(undefined, false)).toBe('cannot_work');
        expect(nextMark('cannot_work', false)).toBe('prefer_to');
        expect(nextMark('prefer_to', false)).toBeUndefined();
    });

    it("adds must_work to a manager's cycle", () => {
        expect(nextMark(undefined, true)).toBe('cannot_work');
        expect(nextMark('cannot_work', true)).toBe('prefer_to');
        expect(nextMark('prefer_to', true)).toBe('must_work');
        expect(nextMark('must_work', true)).toBeUndefined();
    });

    it("frees a must_work cell an employee taps (it isn't in their cycle)", () => {
        expect(nextMark('must_work', false)).toBeUndefined();
    });
});

describe('toggleInList', () => {
    interface Mark { day: number; constraint_type: ConstraintType }
    const isDay = (day: number) => (item: Mark) => item.day === day;
    const create = (day: number) => (type: ConstraintType): Mark => ({ day, constraint_type: type });

    it('adds a mark to a free cell', () => {
        const list: Mark[] = [{ day: 0, constraint_type: 'prefer_to' }];

        expect(toggleInList(list, isDay(1), create(1), false)).toEqual([
            { day: 0, constraint_type: 'prefer_to' },
            { day: 1, constraint_type: 'cannot_work' },
        ]);
    });

    it('moves a marked cell to its next mark without changing the list it got', () => {
        const list: Mark[] = [{ day: 0, constraint_type: 'cannot_work' }];

        const next = toggleInList(list, isDay(0), create(0), false);

        expect(next).toEqual([{ day: 0, constraint_type: 'prefer_to' }]);
        expect(list).toEqual([{ day: 0, constraint_type: 'cannot_work' }]);
        expect(next[0]).not.toBe(list[0]);
    });

    it('removes the mark after the last one in the cycle', () => {
        const list: Mark[] = [{ day: 0, constraint_type: 'prefer_to' }, { day: 1, constraint_type: 'cannot_work' }];

        expect(toggleInList(list, isDay(0), create(0), false)).toEqual([{ day: 1, constraint_type: 'cannot_work' }]);
        expect(list).toHaveLength(2);
    });
});
