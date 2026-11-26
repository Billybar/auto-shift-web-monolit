import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createClient, createLocation, createOrganization } from '@/api/admin';
import { notify } from '@/lib/notify';
import { apiError } from '@/test/apiErrors';
import { testLocation } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { Client, Organization } from '@/types';
import HierarchyTab from './HierarchyTab';

vi.mock('@/api/admin', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/admin')>()),
    createOrganization: vi.fn(),
    createClient: vi.fn(),
    createLocation: vi.fn(),
}));

// Organization 2 has no clients; client 11 has no locations
const ORGANIZATIONS: Organization[] = [{ id: 1, name: 'ארגון א' }, { id: 2, name: 'ארגון ב' }];
const CLIENTS: Client[] = [{ id: 10, name: 'לקוח א', organization_id: 1 }, { id: 11, name: 'לקוח ב', organization_id: 1 }];
const LOCATIONS = [testLocation(5, { name: 'אתר א', client_id: 10 })];

const renderTab = (organizations = ORGANIZATIONS) =>
    renderWithProviders(<HierarchyTab organizations={organizations} clients={CLIENTS} locations={LOCATIONS} />);

describe('HierarchyTab', () => {
    beforeEach(() => {
        vi.mocked(createOrganization).mockResolvedValue({ id: 3, name: 'x' });
        vi.mocked(createClient).mockResolvedValue({ id: 12, name: 'x', organization_id: 1 });
        vi.mocked(createLocation).mockResolvedValue(testLocation(6));
    });

    it('shows the tree, and says where a level is still empty', () => {
        renderTab();

        expect(screen.getByRole('heading', { name: 'ארגון א' })).toBeInTheDocument();
        expect(screen.getByText('לקוח א')).toBeInTheDocument();
        expect(screen.getByText('אתר א')).toBeInTheDocument();
        expect(screen.getByText('אין אתרים עדיין')).toBeInTheDocument();
        expect(screen.getByText('אין לקוחות עדיין')).toBeInTheDocument();
    });

    it('invites the first organization', () => {
        renderTab([]);

        expect(screen.getByText('עדיין אין ארגונים. התחל בהוספת ארגון.')).toBeInTheDocument();
    });

    it('adds an organization and closes the form', async () => {
        const { user } = renderTab();

        await user.click(screen.getByRole('button', { name: 'ארגון חדש' }));
        expect(screen.getByRole('button', { name: 'הוסף' })).toBeDisabled();
        await user.type(screen.getByPlaceholderText('שם הארגון'), ' ארגון ג ');
        await user.click(screen.getByRole('button', { name: 'הוסף' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('הארגון נוסף'));
        expect(vi.mocked(createOrganization).mock.calls[0][0]).toEqual({ name: 'ארגון ג' });
        await waitFor(() => expect(screen.queryByPlaceholderText('שם הארגון')).not.toBeInTheDocument());
    });

    it('adds a client to its organization', async () => {
        const { user } = renderTab();

        // The first organization's button
        await user.click(screen.getAllByRole('button', { name: 'לקוח חדש' })[0]);
        await user.type(screen.getByPlaceholderText('שם הלקוח'), 'לקוח ג');
        await user.click(screen.getByRole('button', { name: 'הוסף' }));

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('הלקוח נוסף'));
        expect(vi.mocked(createClient).mock.calls[0][0]).toEqual({ name: 'לקוח ג', organization_id: 1 });
    });

    it('adds a location to its client', async () => {
        const { user } = renderTab();

        // The second client's button
        await user.click(screen.getAllByRole('button', { name: 'אתר חדש' })[1]);
        await user.type(screen.getByPlaceholderText('שם האתר'), 'אתר ב');
        await user.keyboard('{Enter}');

        await waitFor(() => expect(notify.success).toHaveBeenCalledWith('האתר נוסף'));
        expect(vi.mocked(createLocation).mock.calls[0][0]).toEqual({ name: 'אתר ב', client_id: 11 });
    });

    it('keeps one add form open at a time', async () => {
        const { user } = renderTab();

        await user.click(screen.getByRole('button', { name: 'ארגון חדש' }));
        await user.click(screen.getAllByRole('button', { name: 'אתר חדש' })[0]);

        expect(screen.queryByPlaceholderText('שם הארגון')).not.toBeInTheDocument();
        expect(screen.getAllByPlaceholderText('שם האתר')).toHaveLength(1);
    });

    it('explains a failed add inside the form, and clears it on cancel', async () => {
        vi.mocked(createClient).mockRejectedValue(apiError(500));
        const { user } = renderTab();

        await user.click(screen.getAllByRole('button', { name: 'לקוח חדש' })[0]);
        await user.type(screen.getByPlaceholderText('שם הלקוח'), 'לקוח ג');
        await user.click(screen.getByRole('button', { name: 'הוסף' }));

        expect(await screen.findByText('הוספת הלקוח נכשלה')).toBeInTheDocument();
        expect(screen.getByText('אירעה שגיאה בשרת. נסה שוב בעוד מספר דקות.')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('שם הלקוח')).toHaveValue('לקוח ג');

        await user.click(screen.getByRole('button', { name: 'ביטול' }));

        expect(screen.queryByPlaceholderText('שם הלקוח')).not.toBeInTheDocument();
        await user.click(screen.getAllByRole('button', { name: 'לקוח חדש' })[0]);
        expect(screen.queryByText('הוספת הלקוח נכשלה')).not.toBeInTheDocument();
    });
});
