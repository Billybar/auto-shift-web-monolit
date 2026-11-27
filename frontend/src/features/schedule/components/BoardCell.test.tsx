import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DragPayload } from '@/features/schedule/hooks/scheduleEdits';
import { placementKey } from '@/features/schedule/hooks/useScheduleCheck';
import type { Assignment, Employee, Position, ShiftDefinition } from '@/types';
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
/** The chip that shows this text; its tooltip has line breaks, which getByTitle would collapse. */
const cardOf = (text: string) => screen.getByText(text).closest('[draggable]');

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

    describe("the chip's labels", () => {
        it('shows the compact label, with the full name in the tooltip', () => {
            renderCell({ employeeLabels: new Map([[9, 'דנה ל.']]) });

            expect(screen.getByText('דנה ל.')).toBeInTheDocument();
            expect(chip()).toBeInTheDocument();
        });

        it('names an unknown employee by id', () => {
            renderCell({ employeesMap: {} });

            expect(screen.getByText('Emp #9')).toBeInTheDocument();
        });

        it('marks a chip above the demand', () => {
            renderCell({ required: 0 });

            expect(cardOf('דנה לוי')).toHaveAttribute('title', 'דנה לוי\nמעל התקן');
        });

        it("marks an employee who doesn't hold the role", () => {
            renderCell({ employeesMap: { 9: { ...employee, position_ids: [] } } });

            expect(screen.getByLabelText('לעובד לא מוגדר התפקיד מאבטח')).toBeInTheDocument();
        });

        it("doesn't mark an employee who holds the role", () => {
            renderCell();

            expect(screen.queryByLabelText('לעובד לא מוגדר התפקיד מאבטח')).not.toBeInTheDocument();
        });

        it("lists the check's issues in the tooltip", () => {
            renderCell({ issuesByPlacement: new Map([[placementKey(9, 1, '2026-11-29'), ['חריגה ממספר המשמרות']]]) });

            expect(cardOf('דנה לוי')).toHaveAttribute('title', 'דנה לוי\nחריגה ממספר המשמרות');
        });
    });

    describe('changing the demand', () => {
        it("removes an empty slot's place", () => {
            const onChangeSlots = vi.fn();
            renderCell({ cellAssignments: [], onChangeSlots });

            fireEvent.click(screen.getByRole('button', { name: 'הסר עמדה' }));

            expect(onChangeSlots).toHaveBeenCalledWith(-1);
        });

        it('disables the change while one is saving', () => {
            renderCell({ cellAssignments: [], onChangeSlots: vi.fn(), isPending: true });

            expect(screen.getByRole('button', { name: 'הסר עמדה' })).toBeDisabled();
        });

        it('adds a place on a blank cell', () => {
            const onChangeSlots = vi.fn();
            renderCell({ cellAssignments: [], required: 0, onChangeSlots });

            fireEvent.click(screen.getByRole('button', { name: 'הוסף עמדה' }));

            expect(onChangeSlots).toHaveBeenCalledWith(1);
        });

        it('has no demand buttons when the demand is fixed', () => {
            renderCell({ cellAssignments: [] });

            expect(screen.queryByRole('button', { name: 'הסר עמדה' })).not.toBeInTheDocument();
        });
    });

    describe('drag and drop', () => {
        const sidebarDrag: DragPayload = { type: 'FROM_SIDEBAR', employee_id: 4 };
        const dropOn = (target: Element, payload: DragPayload | null) =>
            fireEvent.drop(target, { dataTransfer: { getData: () => (payload ? JSON.stringify(payload) : '') } });

        it('carries the chip and its slot', () => {
            const setData = vi.fn();
            renderCell({ onDrop: vi.fn() });

            fireEvent.dragStart(chip(), { dataTransfer: { setData } });

            expect(JSON.parse(setData.mock.calls[0][1])).toEqual({
                type: 'FROM_BOARD', employee_id: 9, shift_id: 1, date: '2026-11-29', position_id: 5,
            });
        });

        it('fills an empty slot', () => {
            const onDrop = vi.fn();
            const { container } = renderCell({ cellAssignments: [], onDrop });

            dropOn(container.querySelector('td')!, sidebarDrag);

            expect(onDrop).toHaveBeenCalledWith(sidebarDrag, { shiftId: 1, date: '2026-11-29', positionId: 5, employeeId: null });
        });

        it("names the chip it's dropped on", () => {
            const onDrop = vi.fn();
            const { container } = renderCell({ onDrop });

            dropOn(container.querySelector('td')!, sidebarDrag);

            expect(onDrop).toHaveBeenCalledWith(sidebarDrag, { shiftId: 1, date: '2026-11-29', positionId: 5, employeeId: 9 });
        });

        it('ignores a drop on a blank cell beyond the demand', () => {
            const onDrop = vi.fn();
            const { container } = renderCell({ cellAssignments: [], required: 0, onDrop });

            dropOn(container.querySelector('td')!, sidebarDrag);

            expect(onDrop).not.toHaveBeenCalled();
        });

        it('ignores a drop that carries nothing', () => {
            const onDrop = vi.fn();
            const { container } = renderCell({ cellAssignments: [], onDrop });

            dropOn(container.querySelector('td')!, null);
            dropOn(container.querySelector('td')!, { type: 'FROM_SIDEBAR', employee_id: 0 });

            expect(onDrop).not.toHaveBeenCalled();
        });
    });
});
