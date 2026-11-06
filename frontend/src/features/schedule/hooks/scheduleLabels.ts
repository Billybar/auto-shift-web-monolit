// Hebrew labels for the schedule page's messages (engine results and schedule checks)
import type { Employee, Position, ShiftDefinition } from '../../../types';

// "YYYY-MM-DD" -> e.g. "יום א׳, 25.10"
export const formatDayLabel = (dateStr: string): string => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
};

export interface NameLookups {
    shiftName: (id: number) => string;
    positionName: (id: number) => string;
    employeeName: (id: number) => string;
}

// Names by id, with a "#id" fallback for anything not loaded
export const makeNameLookups = (
    shiftDefinitions: ShiftDefinition[],
    positions: Position[],
    employeesMap: Record<number, Employee>,
): NameLookups => ({
    shiftName: (id) => shiftDefinitions.find(sd => sd.id === id)?.name ?? `משמרת #${id}`,
    positionName: (id) => positions.find(p => p.id === id)?.name ?? `תפקיד #${id}`,
    employeeName: (id) => {
        const emp = employeesMap[id];
        return emp?.user ? `${emp.user.first_name} ${emp.user.last_name}`.trim() : `עובד #${id}`;
    },
});

// Shortest last-name prefix that no other last name starts with, e.g. "כה." next to "כץ"; the whole name when none is unique
export const uniqueLastNamePrefix = (last: string, others: string[]): string => {
    for (let length = 1; length < last.length; length++) {
        const prefix = last.slice(0, length);
        if (others.every(other => other.slice(0, length) !== prefix)) return `${prefix}.`;
    }
    return last;
};

// Compact labels for the board: first name only, plus last-name letters when another employee shares
// the first name (same rule as the mobile schedule). Pass every employee of the location, inactive
// included, so the labels don't change with the sidebar filter.
export const makeShortNames = (employees: Employee[]): Map<number, string> => {
    const parts = employees.map(emp => ({
        id: emp.id,
        first: emp.user?.first_name?.trim() ?? '',
        last: emp.user?.last_name?.trim() ?? '',
    }));
    const labels = new Map<number, string>();
    parts.forEach(({ id, first, last }) => {
        if (!first) {
            labels.set(id, last || `עובד #${id}`);
            return;
        }
        const sameFirstLastNames = parts.filter(p => p.id !== id && p.first === first).map(p => p.last);
        labels.set(id, sameFirstLastNames.length > 0 && last
            ? `${first} ${uniqueLastNamePrefix(last, sameFirstLastNames)}`
            : first);
    });
    return labels;
};
