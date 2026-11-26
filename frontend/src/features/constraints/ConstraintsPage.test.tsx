import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultConstraints, getEmployeeConstraints } from '@/api/constraints';
import { getConstraintGroups } from '@/api/constraintGroups';
import { getShiftDefinitions } from '@/api/shiftDefinitions';
import { testConstraintGroup, testShift, testUser } from '@/test/fixtures';
import { renderWithProviders } from '@/test/renderWithProviders';
import { UserRole } from '@/types';
import ConstraintsPage from './ConstraintsPage';

vi.mock('@/api/constraints', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraints')>()),
    getEmployeeConstraints: vi.fn(),
    getDefaultConstraints: vi.fn(),
}));

vi.mock('@/api/shiftDefinitions', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/shiftDefinitions')>()),
    getShiftDefinitions: vi.fn(),
}));

vi.mock('@/api/constraintGroups', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/constraintGroups')>()),
    getConstraintGroups: vi.fn(),
}));

const IMPORT = 'ייבוא אילוצים ממערכת חיצונית';

describe('ConstraintsPage', () => {
    beforeEach(() => {
        vi.mocked(getEmployeeConstraints).mockResolvedValue({ constraints: [], note: null, uses_defaults: false });
        vi.mocked(getDefaultConstraints).mockResolvedValue({ employee_id: 1, constraints: [] });
        vi.mocked(getShiftDefinitions).mockResolvedValue([testShift(1)]);
        vi.mocked(getConstraintGroups).mockResolvedValue([testConstraintGroup(1)]);
    });

    it("shows the signed-in user's own board", async () => {
        renderWithProviders(<ConstraintsPage />);

        expect(screen.getByText(/אילוצים עבור:\s+דנה כהן/)).toBeInTheDocument();
        await waitFor(() => expect(getEmployeeConstraints).toHaveBeenCalledWith(1, expect.any(String), expect.any(String)));
        expect(getDefaultConstraints).toHaveBeenCalledWith(1);
    });

    it('lets a scheduler open the import dialog', async () => {
        const { user } = renderWithProviders(<ConstraintsPage />);

        await user.click(screen.getByRole('button', { name: IMPORT }));

        expect(screen.getByRole('dialog', { name: IMPORT })).toBeInTheDocument();
    });

    it('needs a location before importing', () => {
        renderWithProviders(<ConstraintsPage />, { locationId: '' });

        expect(screen.getByRole('button', { name: IMPORT })).toBeDisabled();
    });

    it("doesn't offer the import to an employee", () => {
        renderWithProviders(<ConstraintsPage />, { user: testUser(UserRole.EMPLOYEE) });

        expect(screen.queryByRole('button', { name: IMPORT })).not.toBeInTheDocument();
        expect(screen.getByText('לחץ על תא כדי לשנות: פנוי ➔ לא יכול ➔ מעדיף')).toBeInTheDocument();
    });
});
