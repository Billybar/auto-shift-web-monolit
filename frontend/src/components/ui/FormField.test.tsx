import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fieldErrorId } from './fieldErrorId';
import FormField from './FormField';
import { Input, Textarea } from './Input';

describe('FormField', () => {
    it('labels its control', () => {
        render(<FormField label="שם" htmlFor="name"><Input id="name" /></FormField>);
        expect(screen.getByLabelText('שם')).toBeInstanceOf(HTMLInputElement);
    });

    it('shows the error under the control, in place of the hint', () => {
        render(
            <FormField label="שם" htmlFor="name" error="שדה חובה" hint="שם מלא">
                <Input id="name" invalid aria-describedby={fieldErrorId('name')} />
            </FormField>,
        );

        expect(screen.getByLabelText('שם')).toHaveAccessibleDescription('שדה חובה');
        expect(screen.getByLabelText('שם')).toBeInvalid();
        expect(screen.queryByText('שם מלא')).not.toBeInTheDocument();
    });

    it('shows the hint while there is no error', () => {
        render(<FormField label="הערות" htmlFor="notes" hint="לא חובה"><Textarea id="notes" /></FormField>);
        expect(screen.getByText('לא חובה')).toBeInTheDocument();
        expect(screen.getByLabelText('הערות')).toBeInstanceOf(HTMLTextAreaElement);
    });
});
