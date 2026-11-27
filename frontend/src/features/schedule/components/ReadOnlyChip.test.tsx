import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Assignment, Employee, ShiftDefinition } from '@/types';
import ReadOnlyChip from './ReadOnlyChip';

const shift = { id: 1, name: 'בוקר', start_time: '07:00', end_time: '15:00' } as ShiftDefinition;
const assignment: Assignment = { employee_id: 9, shift_id: 1, date: '2026-11-28', position_id: 5 };
const employee = { id: 9, color: 'ffcc00', position_ids: [5], user: { first_name: 'דנה', last_name: 'לוי' } } as unknown as Employee;

/** The chip that shows this name; its tooltip has a line break, which getByTitle would collapse. */
const chipOf = (name: string) => screen.getByText(name).closest('[title]');

describe('ReadOnlyChip', () => {
    describe('the name', () => {
        it('shows the compact label, with the full name in the tooltip', () => {
            render(<ReadOnlyChip assignment={assignment} employee={employee} label="דנה ל." shift={shift} />);

            expect(screen.getByText('דנה ל.')).toBeInTheDocument();
            expect(chipOf('דנה ל.')).toHaveAttribute('title', 'דנה לוי\n07:00 - 15:00');
        });

        it('shows the full name without a label', () => {
            render(<ReadOnlyChip assignment={assignment} employee={employee} shift={shift} />);

            expect(screen.getByText('דנה לוי')).toBeInTheDocument();
        });

        it('names an unknown employee by id', () => {
            render(<ReadOnlyChip assignment={assignment} employee={undefined} shift={shift} />);

            expect(screen.getByText('Emp #9')).toBeInTheDocument();
            expect(chipOf('Emp #9')).toHaveAttribute('title', 'Emp #9\n07:00 - 15:00');
        });
    });

    describe('the hours', () => {
        it("shows the shift's hours, not highlighted", () => {
            render(<ReadOnlyChip assignment={assignment} employee={employee} shift={shift} />);

            expect(screen.getByText('07:00')).not.toHaveClass('bg-blue-500');
            expect(screen.getByText('15:00')).not.toHaveClass('bg-blue-500');
        });

        it("highlights the assignment's own hours", () => {
            render(<ReadOnlyChip assignment={{ ...assignment, start_time: '08:00', end_time: '15:00' }} employee={employee} shift={shift} />);

            expect(screen.getByText('08:00')).toHaveClass('bg-blue-500');
            // An end equal to the shift's is not a change
            expect(screen.getByText('15:00')).not.toHaveClass('bg-blue-500');
            expect(chipOf('דנה לוי')).toHaveAttribute('title', 'דנה לוי\n08:00 - 15:00');
        });

        it('highlights a changed end alone', () => {
            render(<ReadOnlyChip assignment={{ ...assignment, end_time: '16:00' }} employee={employee} shift={shift} />);

            expect(screen.getByText('07:00')).not.toHaveClass('bg-blue-500');
            expect(screen.getByText('16:00')).toHaveClass('bg-blue-500');
        });
    });
});
