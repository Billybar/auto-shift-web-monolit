import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { testUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import { UserRole } from '@/types';
import { ProtectedRoute } from './ProtectedRoute';

const ADMIN_ONLY = [UserRole.ADMIN];
const page = <p>ניהול מערכת</p>;

describe('ProtectedRoute', () => {
    it('waits with a spinner while the stored session is read', () => {
        renderWithProviders(<ProtectedRoute />, { user: null, authLoading: true, route: '/admin', outlet: page });

        expect(screen.getByRole('status', { name: 'טוען…' })).toBeInTheDocument();
        expect(screen.queryByText('ניהול מערכת')).not.toBeInTheDocument();
        expect(screen.queryByTestId('current-path')).not.toBeInTheDocument();
    });

    it('sends a signed-out visitor to the login page, remembering where they were going', () => {
        renderWithProviders(<ProtectedRoute />, { user: null, route: '/admin', outlet: page });

        const current = screen.getByTestId('current-path');
        expect(current).toHaveTextContent('/login');
        expect(JSON.parse(current.dataset.state!)).toMatchObject({ from: { pathname: '/admin' } });
    });

    it('sends a user without the role home', () => {
        renderWithProviders(<ProtectedRoute allowedRoles={ADMIN_ONLY} />, { user: testUser(UserRole.SCHEDULER), route: '/admin', outlet: page });

        expect(screen.getByTestId('current-path')).toHaveTextContent(/^\/$/);
        expect(screen.queryByText('ניהול מערכת')).not.toBeInTheDocument();
    });

    it('shows the page to a user with the role', () => {
        renderWithProviders(<ProtectedRoute allowedRoles={ADMIN_ONLY} />, { user: testUser(UserRole.ADMIN), route: '/admin', outlet: page });

        expect(screen.getByText('ניהול מערכת')).toBeInTheDocument();
    });

    it('shows the page to any signed-in user when no roles are listed', () => {
        renderWithProviders(<ProtectedRoute />, { user: testUser(UserRole.EMPLOYEE), route: '/admin', outlet: page });

        expect(screen.getByText('ניהול מערכת')).toBeInTheDocument();
    });
});
