// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { Position } from '@/types';
import { reorderUpdates } from './positionOrder';

const position = (id: number, sortOrder: number) => ({ id, sort_order: sortOrder }) as Position;

describe('reorderUpdates', () => {
    const roles = [position(1, 0), position(2, 1), position(3, 2)];

    it('swaps a role with the one above it', () => {
        expect(reorderUpdates(roles, 2, -1)).toEqual([
            { positionId: 3, sortOrder: 1 },
            { positionId: 2, sortOrder: 2 },
        ]);
    });

    it('swaps a role with the one below it', () => {
        expect(reorderUpdates(roles, 0, 1)).toEqual([
            { positionId: 2, sortOrder: 0 },
            { positionId: 1, sortOrder: 1 },
        ]);
    });

    it("renumbers roles whose stored order doesn't match the list", () => {
        // Older roles may share or skip numbers
        const gappy = [position(1, 0), position(2, 5), position(3, 5)];

        expect(reorderUpdates(gappy, 0, 1)).toEqual([
            { positionId: 2, sortOrder: 0 },
            { positionId: 1, sortOrder: 1 },
            { positionId: 3, sortOrder: 2 },
        ]);
    });

    it('refuses a move past either end', () => {
        expect(reorderUpdates(roles, 0, -1)).toBeNull();
        expect(reorderUpdates(roles, 2, 1)).toBeNull();
        expect(reorderUpdates([], 0, 1)).toBeNull();
    });
});
