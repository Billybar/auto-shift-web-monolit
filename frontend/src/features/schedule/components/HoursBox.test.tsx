import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import HoursBox from './HoursBox';

type Props = Parameters<typeof HoursBox>[0];

const renderBox = (props: Partial<Props> = {}) => {
    const onSave = vi.fn();
    render(
        <div>
            <HoursBox defaultStartTime="07:00" defaultEndTime="15:00" onSave={onSave} {...props} />
            <button type="button">מחוץ לפס</button>
        </div>
    );
    return { onSave, user: userEvent.setup() };
};

/** The two time inputs of the open strip, start first. */
const timeInputs = () => {
    const start = screen.getByDisplayValue('07:00');
    const end = screen.getByDisplayValue('15:00');
    return { start, end };
};

describe('HoursBox', () => {
    describe('showing', () => {
        it('shows the default hours, not highlighted', () => {
            renderBox();

            expect(screen.getByText('07:00')).not.toHaveClass('bg-blue-500');
            expect(screen.getByText('15:00')).not.toHaveClass('bg-blue-500');
        });

        it('highlights custom hours', () => {
            renderBox({ assignmentStartTime: '08:00', assignmentEndTime: '16:00' });

            expect(screen.getByText('08:00')).toHaveClass('bg-blue-500');
            expect(screen.getByText('16:00')).toHaveClass('bg-blue-500');
        });

        it("can't be edited without onSave", () => {
            renderBox({ onSave: undefined });

            expect(screen.queryByTitle('לחץ לעריכת שעות')).not.toBeInTheDocument();
            fireEvent.click(screen.getByText('07:00'));
            expect(screen.queryByDisplayValue('07:00')).not.toBeInTheDocument();
        });
    });

    describe('editing', () => {
        it('opens two time inputs, with focus on the start', async () => {
            const { user } = renderBox();

            await user.click(screen.getByTitle('לחץ לעריכת שעות'));

            const { start, end } = timeInputs();
            expect(start).toHaveFocus();
            expect(end).toHaveAttribute('type', 'time');
        });

        it('saves the new hours on Enter and closes', async () => {
            const { user, onSave } = renderBox();
            await user.click(screen.getByTitle('לחץ לעריכת שעות'));

            fireEvent.change(timeInputs().end, { target: { value: '16:00' } });
            fireEvent.keyDown(screen.getByDisplayValue('16:00'), { key: 'Enter' });

            expect(onSave).toHaveBeenCalledWith('07:00', '16:00');
            expect(screen.queryByDisplayValue('16:00')).not.toBeInTheDocument();
        });

        it('drops the edit on Escape', async () => {
            const { user, onSave } = renderBox();
            await user.click(screen.getByTitle('לחץ לעריכת שעות'));

            fireEvent.change(timeInputs().start, { target: { value: '09:00' } });
            fireEvent.keyDown(screen.getByDisplayValue('09:00'), { key: 'Escape' });

            expect(onSave).not.toHaveBeenCalled();
            expect(screen.queryByDisplayValue('09:00')).not.toBeInTheDocument();
            // Reopening starts again from the saved hours
            await user.click(screen.getByTitle('לחץ לעריכת שעות'));
            expect(timeInputs().start).toBeInTheDocument();
        });

        it('saves nothing when nothing changed', async () => {
            const { user, onSave } = renderBox();
            await user.click(screen.getByTitle('לחץ לעריכת שעות'));

            fireEvent.keyDown(timeInputs().start, { key: 'Enter' });

            expect(onSave).not.toHaveBeenCalled();
            expect(screen.getByTitle('לחץ לעריכת שעות')).toBeInTheDocument();
        });

        it('saves when focus leaves the strip', async () => {
            const { user, onSave } = renderBox();
            await user.click(screen.getByTitle('לחץ לעריכת שעות'));
            fireEvent.change(timeInputs().end, { target: { value: '16:00' } });

            fireEvent.focusOut(screen.getByDisplayValue('16:00'), { relatedTarget: screen.getByRole('button', { name: 'מחוץ לפס' }) });

            expect(onSave).toHaveBeenCalledWith('07:00', '16:00');
        });

        it('stays open when focus moves to the other input', async () => {
            const { user, onSave } = renderBox();
            await user.click(screen.getByTitle('לחץ לעריכת שעות'));
            const { start, end } = timeInputs();

            fireEvent.focusOut(start, { relatedTarget: end });

            expect(onSave).not.toHaveBeenCalled();
            expect(end).toBeInTheDocument();
        });
    });
});
