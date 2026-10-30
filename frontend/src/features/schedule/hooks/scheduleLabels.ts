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
