import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getConstraintSubmissionStatus } from '../../../api/constraints';
import { createQueryWrapper } from '../../../test/queryWrapper';
import { useConstraintSubmissions } from './useConstraintSubmissions';

vi.mock('../../../api/constraints', () => ({ getConstraintSubmissionStatus: vi.fn() }));

const renderSubmissions = (isPublished: boolean, isStaff: boolean) => {
    const { wrapper } = createQueryWrapper();
    return renderHook(() => useConstraintSubmissions(3, '2026-11-29', isPublished, isStaff), { wrapper });
};

describe('useConstraintSubmissions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getConstraintSubmissionStatus).mockResolvedValue({ pending_employee_ids: [4, 7] } as never);
    });

    it('marks who has not submitted, for staff on a draft week', async () => {
        const { result } = renderSubmissions(false, true);
        await vi.waitFor(() => expect([...result.current]).toEqual([4, 7]));
        expect(getConstraintSubmissionStatus).toHaveBeenCalledWith(3, '2026-11-29');
    });

    it('fetches nothing for a published week', () => {
        const { result } = renderSubmissions(true, true);
        expect(result.current.size).toBe(0);
        expect(getConstraintSubmissionStatus).not.toHaveBeenCalled();
    });

    it('fetches nothing for an employee (the endpoint is for schedulers)', () => {
        const { result } = renderSubmissions(false, false);
        expect(result.current.size).toBe(0);
        expect(getConstraintSubmissionStatus).not.toHaveBeenCalled();
    });
});
