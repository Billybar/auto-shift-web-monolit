import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Trash2 } from 'lucide-react';
import IconButton from './IconButton';

describe('IconButton', () => {
    it('is named by its label, which is also its tooltip', () => {
        render(<IconButton label="מחק משמרת"><Trash2 /></IconButton>);
        const button = screen.getByRole('button', { name: 'מחק משמרת' });

        expect(button).toHaveAttribute('title', 'מחק משמרת');
        expect(button).toHaveAttribute('type', 'button');
    });

    it('clicks, unless disabled', async () => {
        const onClick = vi.fn();
        const { rerender } = render(<IconButton label="הבא" onClick={onClick}><Trash2 /></IconButton>);
        await userEvent.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledOnce();

        rerender(<IconButton label="הבא" onClick={onClick} disabled><Trash2 /></IconButton>);
        await userEvent.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('uses the red style for danger', () => {
        render(<IconButton label="מחק" tone="danger"><Trash2 /></IconButton>);
        expect(screen.getByRole('button')).toHaveClass('text-red-500');
    });

    it('passes the ref to the button, so it can be a radix trigger', () => {
        const ref = createRef<HTMLButtonElement>();
        render(<IconButton label="תפריט" ref={ref}><Trash2 /></IconButton>);
        expect(ref.current).toBe(screen.getByRole('button'));
    });
});
