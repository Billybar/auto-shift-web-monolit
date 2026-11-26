import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageEmpty, PageSpinner } from './PageState';

describe('PageSpinner', () => {
    it('is announced as a loading status', () => {
        render(<PageSpinner />);
        expect(screen.getByRole('status', { name: 'טוען…' })).toBeInTheDocument();
    });
});

describe('PageEmpty', () => {
    it('shows the title as a heading', () => {
        render(<PageEmpty title="בחר אתר" />);
        expect(screen.getByRole('heading', { name: 'בחר אתר' })).toBeInTheDocument();
    });

    it('shows the icon and the extra content when given', () => {
        render(
            <PageEmpty icon={<span data-testid="icon" />} title="בחר אתר">
                <p>עוד פרטים</p>
            </PageEmpty>
        );
        expect(screen.getByTestId('icon')).toBeInTheDocument();
        expect(screen.getByText('עוד פרטים')).toBeInTheDocument();
    });
});
