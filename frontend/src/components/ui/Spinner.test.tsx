import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Spinner from './Spinner';

describe('Spinner', () => {
    it('is announced as a loading status', () => {
        render(<Spinner />);
        expect(screen.getByRole('status', { name: 'טוען…' })).toHaveClass('animate-spin');
    });

    it.each([
        ['sm', 'h-8'],
        ['md', 'h-10'],
        ['lg', 'h-12'],
    ] as const)('size %s is %s', (size, height) => {
        render(<Spinner size={size} />);
        expect(screen.getByRole('status')).toHaveClass(height);
    });
});
