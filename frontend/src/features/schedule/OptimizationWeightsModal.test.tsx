import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FormEvent } from 'react';

import type { LocationWeights } from '@/types';
import OptimizationWeightsModal from './OptimizationWeightsModal';

// Each value is distinct, so its percentage names one rule. target_shifts is above the slider's max (50).
const WEIGHTS: LocationWeights = {
    rest_gap: 10,
    two_rest_gaps: 0,
    two_consecutive_nights: 50,
    consecutive_nights: 3,
    target_shifts: 80,
    min_mornings: 4,
    max_mornings: 5,
    min_evenings: 6,
    max_evenings: 7,
    min_nights: 8,
    max_nights: 9,
    prefer_to: 11,
    secondary_position: 12,
};

const REST_GAP = 'מנוחה קצרה בין משמרות';

const renderModal = (props: { isSubmitting?: boolean; error?: string | null } = {}) => {
    const callbacks = {
        onChange: vi.fn(),
        // jsdom can't navigate, so the submit is stopped as the parent does
        onSubmit: vi.fn((e: FormEvent) => e.preventDefault()),
        onClose: vi.fn(),
    };
    render(<OptimizationWeightsModal weights={WEIGHTS} isSubmitting={false} {...callbacks} {...props} />);
    return { ...callbacks, user: userEvent.setup() };
};

describe('OptimizationWeightsModal', () => {
    beforeEach(() => {
        // The Radix Slider measures its thumb; jsdom has no ResizeObserver
        vi.stubGlobal('ResizeObserver', class {
            observe() {}
            unobserve() {}
            disconnect() {}
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('shows each rule with its weight as a percentage', () => {
        renderModal();

        expect(screen.getByRole('dialog', { name: 'כיוונון השיבוץ' })).toBeInTheDocument();
        expect(screen.getByText(REST_GAP)).toBeInTheDocument();
        expect(screen.getByText('8 עד 10 שעות מנוחה, בין משמרות')).toBeInTheDocument();
        expect(screen.getByText('20%')).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: REST_GAP })).toHaveAttribute('aria-valuenow', '10');
    });

    it('shows a weight above the scale at its end, with its real value', () => {
        renderModal();

        expect(screen.getByText('160%')).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'יעד משמרות לעובד' })).toHaveAttribute('aria-valuenow', '50');
    });

    it('steps a weight once per click', async () => {
        const { user, onChange } = renderModal();

        await user.click(screen.getByRole('button', { name: `הגדלה: ${REST_GAP}` }));

        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange).toHaveBeenCalledWith({ ...WEIGHTS, rest_gap: 11 });
    });

    it('steps once from the keyboard', async () => {
        const { user, onChange } = renderModal();

        screen.getByRole('button', { name: `הקטנה: ${REST_GAP}` }).focus();
        await user.keyboard('{Enter}');

        expect(onChange).toHaveBeenCalledOnce();
        expect(onChange).toHaveBeenCalledWith({ ...WEIGHTS, rest_gap: 9 });
    });

    it('stops the arrows at the ends of the scale', () => {
        renderModal();

        expect(screen.getByRole('button', { name: 'הקטנה: 2 מנוחות קצרות ברצף' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'הגדלה: 2 מנוחות קצרות ברצף' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'הגדלה: 2 לילות ברצף' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'הגדלה: יעד משמרות לעובד' })).toBeDisabled();
    });

    it('moves a weight to either end with the slider keys', async () => {
        const { user, onChange } = renderModal();
        const slider = screen.getByRole('slider', { name: REST_GAP });

        slider.focus();
        await user.keyboard('{End}');
        expect(onChange).toHaveBeenLastCalledWith({ ...WEIGHTS, rest_gap: 50 });

        await user.keyboard('{Home}');
        expect(onChange).toHaveBeenLastCalledWith({ ...WEIGHTS, rest_gap: 0 });
    });

    it('toggles the explanation', async () => {
        const { user } = renderModal();
        const toggle = screen.getByRole('button', { name: 'הסבר' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');

        await user.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText(/^הכללים כאן גמישים/)).toBeInTheDocument();

        await user.click(toggle);
        expect(screen.queryByText(/^הכללים כאן גמישים/)).not.toBeInTheDocument();
    });

    it('shows why the last save failed', () => {
        renderModal({ error: 'אירעה שגיאה בשרת.' });

        const alert = screen.getByRole('alert');
        expect(within(alert).getByText('שמירת משקלי השיבוץ נכשלה')).toBeInTheDocument();
        expect(alert).toHaveTextContent('אירעה שגיאה בשרת.');
    });

    it('saves, cancels and closes', async () => {
        const { user, onSubmit, onClose } = renderModal();

        await user.click(screen.getByRole('button', { name: 'שמור' }));
        expect(onSubmit).toHaveBeenCalledOnce();

        await user.click(screen.getByRole('button', { name: 'ביטול' }));
        await user.click(screen.getByRole('button', { name: 'סגירה' }));
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(3);
    });

    it('holds still while a save is in flight', async () => {
        const { user, onClose } = renderModal({ isSubmitting: true });

        expect(screen.getByRole('button', { name: 'שומר...' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'ביטול' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'סגירה' })).toBeDisabled();

        await user.keyboard('{Escape}');

        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});
