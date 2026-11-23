import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button';

describe('Button', () => {
    it('is type="button" unless told otherwise, so it never submits a form by accident', () => {
        render(<Button>ביטול</Button>);
        expect(screen.getByRole('button', { name: 'ביטול' })).toHaveAttribute('type', 'button');
    });

    it('while loading: disabled, busy, and clicks do nothing', async () => {
        const onClick = vi.fn();
        render(<Button loading onClick={onClick}>שומר...</Button>);
        const button = screen.getByRole('button', { name: 'שומר...' });

        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
        await userEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    it('is enabled and not busy by default', async () => {
        const onClick = vi.fn();
        render(<Button onClick={onClick}>שמור</Button>);
        const button = screen.getByRole('button', { name: 'שמור' });

        expect(button).toBeEnabled();
        expect(button).not.toHaveAttribute('aria-busy');
        await userEvent.click(button);
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('lets a caller class override the same kind of default class', () => {
        render(<Button className="px-5">שמור</Button>);
        const { className } = screen.getByRole('button');
        expect(className).toContain('px-5');
        expect(className).not.toContain('px-4');
    });

    it('uses the red style for danger', () => {
        render(<Button variant="danger">מחק</Button>);
        expect(screen.getByRole('button')).toHaveClass('bg-red-600');
    });
});
