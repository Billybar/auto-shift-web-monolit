import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Assignment, Employee, Position, ShiftDefinition } from '../../../types';
import BoardCell from './BoardCell';
import type { BoardCellProps } from './BoardCell';

const shift = { id: 1, name: 'בוקר', start_time: '07:00', end_time: '15:00' } as ShiftDefinition;
const position = { id: 5, name: 'מאבטח' } as Position;
const assignment: Assignment = { employee_id: 9, shift_id: 1, date: '2026-11-29', position_id: 5 };
const employee = { id: 9, color: 'ffcc00', position_ids: [5], user: { first_name: 'דנה', last_name: 'לוי' } } as unknown as Employee;

const renderCell = (props: Partial<BoardCellProps> = {}) => render(
    <table><tbody><tr>
        <BoardCell
            shift={shift}
            position={position}
            dateStr="2026-11-29"
            slotIndex={0}
            dividerClass=""
            cellAssignments={[assignment]}
            required={1}
            employeesMap={{ 9: employee }}
            isPending={false}
            {...props}
        />
    </tr></tbody></table>
);

const chip = () => screen.getByTitle('דנה לוי');

describe('BoardCell', () => {
    it('lets staff drag, remove and edit hours', () => {
        const onRemove = vi.fn();
        renderCell({ onDrop: vi.fn(), onRemove, onUpdateHours: vi.fn() });

        expect(chip()).toHaveAttribute('draggable', 'true');
        fireEvent.click(screen.getByTitle('הסר עובד'));
        expect(onRemove).toHaveBeenCalledWith({ employeeId: 9, shiftId: 1, date: '2026-11-29' });

        fireEvent.click(screen.getByTitle('לחץ לעריכת שעות'));
        expect(screen.getByDisplayValue('07:00')).toBeInTheDocument();
    });

    it('shows a read-only chip without edit handlers (an employee)', () => {
        renderCell();

        expect(chip()).toHaveAttribute('draggable', 'false');
        expect(screen.queryByTitle('הסר עובד')).not.toBeInTheDocument();
        expect(screen.queryByTitle('לחץ לעריכת שעות')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('07:00'));
        expect(screen.queryByDisplayValue('07:00')).not.toBeInTheDocument();
    });
});
