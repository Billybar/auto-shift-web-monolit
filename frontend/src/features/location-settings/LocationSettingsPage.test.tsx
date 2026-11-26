import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getConstraintGroups } from '@/api/constraintGroups';
import { getDemandTemplate } from '@/api/locations';
import { getPositions } from '@/api/positions';
import { getShiftDefinitions } from '@/api/shiftDefinitions';
import { apiError } from '@/test/apiErrors';
import { testConstraintGroup, testPosition, testShift } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import LocationSettingsPage from './LocationSettingsPage';

vi.mock('@/api/positions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/positions')>()),
    getPositions: vi.fn(),
}));

vi.mock('@/api/locations', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/locations')>()),
    getDemandTemplate: vi.fn(),
}));

vi.mock('@/api/shiftDefinitions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/shiftDefinitions')>()),
    getShiftDefinitions: vi.fn(),
}));

vi.mock('@/api/constraintGroups', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraintGroups')>()),
    getConstraintGroups: vi.fn(),
}));

describe('LocationSettingsPage', () => {
    beforeEach(() => {
        vi.mocked(getPositions).mockResolvedValue([testPosition(1)]);
        vi.mocked(getDemandTemplate).mockResolvedValue({ location_id: 1, cells: [] });
        vi.mocked(getShiftDefinitions).mockResolvedValue([testShift(1)]);
        vi.mocked(getConstraintGroups).mockResolvedValue([testConstraintGroup(1, { name: 'שורת בוקר' })]);
    });

    it('asks for a location first', () => {
        renderWithProviders(<LocationSettingsPage />, { locationId: '' });

        expect(screen.getByText('בחר אתר בתפריט העליון כדי לערוך את ההגדרות שלו')).toBeInTheDocument();
        expect(getPositions).not.toHaveBeenCalled();
    });

    it('shows a failed load in place of the tabs, with a retry', async () => {
        vi.mocked(getPositions).mockRejectedValue(apiError(500));
        const { user } = renderWithProviders(<LocationSettingsPage />);

        expect(await screen.findByText('טעינת התפקידים נכשלה')).toBeInTheDocument();
        expect(screen.queryByRole('tab')).not.toBeInTheDocument();

        vi.mocked(getPositions).mockResolvedValue([testPosition(1)]);
        await user.click(screen.getByRole('button', { name: 'נסה שוב' }));

        expect(await screen.findByRole('tab', { name: 'תפקידים' })).toBeInTheDocument();
    });

    it('opens on the roles tab', async () => {
        renderWithProviders(<LocationSettingsPage />);

        expect(await screen.findByDisplayValue('role 1')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'תפקידים' })).toHaveAttribute('aria-selected', 'true');
        expect(getPositions).toHaveBeenCalledWith(1, true);
    });

    it('shows the weekly template and the board rows in their tabs', async () => {
        const { user } = renderWithProviders(<LocationSettingsPage />);
        await screen.findByDisplayValue('role 1');

        await user.click(screen.getByRole('tab', { name: 'תקן שבועי' }));
        expect(await screen.findByRole('button', { name: 'הוספה: בוקר, role 1, ראשון' })).toBeInTheDocument();

        await user.click(screen.getByRole('tab', { name: 'שורות בלוח האילוצים' }));
        expect(await screen.findByDisplayValue('שורת בוקר')).toBeInTheDocument();
    });
});
