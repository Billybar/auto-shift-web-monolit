import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogContent, DialogTitle } from './Dialog';

// While a modal radix dialog is open the page behind it has pointer-events: none;
// the backdrop tests press there on purpose, so user-event must not refuse
const user = userEvent.setup({ pointerEventsCheck: 0 });

function renderDialog(onOpenChange = vi.fn(), closeOnBackdrop?: boolean) {
    render(
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent aria-describedby={undefined} closeOnBackdrop={closeOnBackdrop}>
                <DialogTitle>עריכת עובד</DialogTitle>
                <input aria-label="שם" />
            </DialogContent>
        </Dialog>,
    );
    return onOpenChange;
}

// Radix starts listening for outside presses one tick after the dialog opens
const afterOpen = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('Dialog', () => {
    it('is a dialog named by its title', () => {
        renderDialog();
        expect(screen.getByRole('dialog', { name: 'עריכת עובד' })).toBeInTheDocument();
    });

    it('moves focus inside the dialog', () => {
        renderDialog();
        expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    });

    it('asks to close on Esc', async () => {
        const onOpenChange = renderDialog();
        await user.keyboard('{Escape}');
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('asks to close on a press outside the panel', async () => {
        const onOpenChange = renderDialog();
        await afterOpen();
        await user.pointer({ keys: '[MouseLeft]', target: document.body });
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('ignores a press outside the panel when closeOnBackdrop is false', async () => {
        const onOpenChange = renderDialog(vi.fn(), false);
        await afterOpen();
        await user.pointer({ keys: '[MouseLeft]', target: document.body });
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('does not close on a press inside the panel', async () => {
        const onOpenChange = renderDialog();
        await afterOpen();
        await user.click(screen.getByRole('textbox', { name: 'שם' }));
        expect(onOpenChange).not.toHaveBeenCalled();
    });
});
