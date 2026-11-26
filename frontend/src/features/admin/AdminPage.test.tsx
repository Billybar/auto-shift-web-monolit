import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAllLocations, getClients, getOrganizations, getStaffUsers } from '@/api/admin';
import { getShiftDefinitions } from '@/api/shiftDefinitions';
import { apiError } from '@/test/apiErrors';
import { testLocation, testStaffUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import AdminPage from './AdminPage';

vi.mock('@/api/admin', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/admin')>()),
    getOrganizations: vi.fn(),
    getClients: vi.fn(),
    getAllLocations: vi.fn(),
    getStaffUsers: vi.fn(),
}));

vi.mock('@/api/shiftDefinitions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/shiftDefinitions')>()),
    getShiftDefinitions: vi.fn(),
}));

describe('AdminPage', () => {
    beforeEach(() => {
        vi.mocked(getOrganizations).mockResolvedValue([{ id: 1, name: 'ארגון א' }]);
        vi.mocked(getClients).mockResolvedValue([{ id: 1, name: 'לקוח א', organization_id: 1 }]);
        vi.mocked(getAllLocations).mockResolvedValue([testLocation(1, { name: 'אתר א' })]);
        vi.mocked(getStaffUsers).mockResolvedValue([testStaffUser(2)]);
        vi.mocked(getShiftDefinitions).mockResolvedValue([]);
    });

    it('shows a spinner while the hierarchy loads', () => {
        renderWithProviders(<AdminPage />);

        expect(screen.getByRole('status', { name: 'טוען…' })).toBeInTheDocument();
    });

    it('opens on the hierarchy tab', async () => {
        renderWithProviders(<AdminPage />);

        expect(await screen.findByText('ארגון א')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'מבנה ארגוני' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('לקוח א')).toBeInTheDocument();
        expect(screen.getByText('אתר א')).toBeInTheDocument();
    });

    it('shows a failed load in place of the tabs, and reloads every list', async () => {
        vi.mocked(getClients).mockRejectedValue(apiError(500));
        const { user } = renderWithProviders(<AdminPage />);

        expect(await screen.findByText('טעינת נתוני הניהול נכשלה')).toBeInTheDocument();
        expect(screen.queryByRole('tab')).not.toBeInTheDocument();

        vi.mocked(getClients).mockResolvedValue([]);
        await user.click(screen.getByRole('button', { name: 'נסה שוב' }));

        expect(await screen.findByText('ארגון א')).toBeInTheDocument();
        expect(getOrganizations).toHaveBeenCalledTimes(2);
        expect(getAllLocations).toHaveBeenCalledTimes(2);
    });

    it('loads the staff list when the users tab opens', async () => {
        const { user } = renderWithProviders(<AdminPage />);
        await screen.findByText('ארגון א');
        expect(getStaffUsers).not.toHaveBeenCalled();

        await user.click(screen.getByRole('tab', { name: 'משתמשים' }));

        expect(await screen.findByText('משתמש 2')).toBeInTheDocument();
    });

    it('shows the shifts tab with its location picker', async () => {
        const { user } = renderWithProviders(<AdminPage />);
        await screen.findByText('ארגון א');

        await user.click(screen.getByRole('tab', { name: 'משמרות' }));

        expect(screen.getByLabelText('אתר')).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'אתר א' })).toBeInTheDocument();
    });
});
