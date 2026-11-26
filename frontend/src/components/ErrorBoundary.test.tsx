import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logError } from '@/api/errors';
import ErrorBoundary from './ErrorBoundary';

function Boom(): never {
    throw new Error('boom');
}

describe('ErrorBoundary', () => {
    beforeEach(() => {
        // React reports the caught render error on the console
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('renders its children', () => {
        render(<ErrorBoundary><p>תוכן</p></ErrorBoundary>);

        expect(screen.getByText('תוכן')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the recovery screen and logs the error when a child throws', () => {
        render(<ErrorBoundary><Boom /></ErrorBoundary>);

        expect(screen.getByRole('alert')).toHaveTextContent('משהו השתבש');
        expect(logError).toHaveBeenCalledWith(
            expect.stringContaining('Unhandled render error'),
            expect.objectContaining({ message: 'boom' }),
        );
    });

    it('reloads the page from the recovery screen', async () => {
        const reload = vi.fn();
        vi.stubGlobal('location', { reload });
        render(<ErrorBoundary><Boom /></ErrorBoundary>);

        await userEvent.click(screen.getByRole('button', { name: 'רענון הדף' }));

        expect(reload).toHaveBeenCalledOnce();
    });
});
