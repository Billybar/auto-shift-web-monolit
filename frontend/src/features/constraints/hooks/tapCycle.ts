// src/features/constraints/hooks/tapCycle.ts
import type { ConstraintType } from '../../../types';

// The marks a tap moves a cell through, starting from a free cell; a tap on the last one frees it
const EMPLOYEE_TAP_CYCLE: ConstraintType[] = ['cannot_work', 'prefer_to'];
const MANAGER_TAP_CYCLE: ConstraintType[] = ['cannot_work', 'prefer_to', 'must_work'];

/**
 * The mark a cell gets when tapped: the next one in the user's cycle, or undefined to free it.
 * A mark outside the user's cycle (e.g. a must_work a manager set) is cleared too.
 */
export const nextMark = (current: ConstraintType | undefined, isManager: boolean): ConstraintType | undefined => {
    const cycle = isManager ? MANAGER_TAP_CYCLE : EMPLOYEE_TAP_CYCLE;
    if (current === undefined) return cycle[0];
    const position = cycle.indexOf(current);
    return position >= 0 ? cycle[position + 1] : undefined;
};

/**
 * Returns the list with the cell matched by `isCell` moved to its next mark (added, changed or removed).
 * `create` builds a new item for a free cell.
 */
export const toggleInList = <T extends { constraint_type: ConstraintType }>(
    list: T[],
    isCell: (item: T) => boolean,
    create: (type: ConstraintType) => T,
    isManager: boolean
): T[] => {
    const index = list.findIndex(isCell);
    const next = nextMark(index >= 0 ? list[index].constraint_type : undefined, isManager);
    if (index < 0) return next ? [...list, create(next)] : list;
    const updated = [...list];
    if (next) {
        // Immutable update, so React re-renders the cell
        updated[index] = { ...updated[index], constraint_type: next };
    } else {
        updated.splice(index, 1);
    }
    return updated;
};
