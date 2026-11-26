import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createShiftDefinition, updateShiftDefinition } from '@/api/shiftDefinitions';
import { notify } from '@/lib/notify';
import { createQueryWrapper } from '@/test/queryWrapper';
import type { ShiftDefinition } from '@/types';
import { useShiftForm } from './useShiftForm';

vi.mock('@/api/shiftDefinitions', () => ({ createShiftDefinition: vi.fn(), updateShiftDefinition: vi.fn() }));

const LOCATION = 3;
const MORNING = { id: 12, name: 'בוקר', start_time: '07:00', end_time: '15:00' } as ShiftDefinition;

// The shift list, the board rows and the demand template are all built from the shifts
const SHIFT_VIEWS = [['shiftDefinitions', LOCATION], ['constraintGroups', LOCATION], ['demandTemplate', LOCATION]];

const renderForm = () => {
    const { client, wrapper } = createQueryWrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    return { ...renderHook(() => useShiftForm(LOCATION), { wrapper }), invalidate };
};

describe('useShiftForm', () => {
    beforeEach(() => {
        vi.mocked(createShiftDefinition).mockResolvedValue(MORNING);
        vi.mocked(updateShiftDefinition).mockResolvedValue(MORNING);
    });

    it('adds a shift to the location, refreshes what the shifts feed, and empties the form', async () => {
        const { result, invalidate } = renderForm();
        act(() => {
            result.current.setField('name', ' ערב ');
            result.current.setField('startTime', '15:00');
            result.current.setField('endTime', '23:00');
        });

        let saved = false;
        await act(async () => { saved = await result.current.submit(); });

        expect(saved).toBe(true);
        expect(createShiftDefinition).toHaveBeenCalledWith({
            name: 'ערב', start_time: '15:00', end_time: '23:00', location_id: LOCATION,
        });
        SHIFT_VIEWS.forEach(queryKey => expect(invalidate).toHaveBeenCalledWith({ queryKey }));
        expect(notify.success).toHaveBeenCalledWith('המשמרת נוספה');
        expect(result.current.values).toEqual({ name: '', startTime: '', endTime: '' });
    });

    it('edits an existing shift', async () => {
        const { result } = renderForm();
        act(() => result.current.startEdit(MORNING));
        expect(result.current.isEditMode).toBe(true);
        expect(result.current.values).toEqual({ name: 'בוקר', startTime: '07:00', endTime: '15:00' });

        act(() => result.current.setField('endTime', '14:00'));
        await act(() => result.current.submit());

        expect(updateShiftDefinition).toHaveBeenCalledWith(12, { name: 'בוקר', start_time: '07:00', end_time: '14:00' });
        expect(notify.success).toHaveBeenCalledWith('המשמרת עודכנה');
        expect(result.current.isEditMode).toBe(false);
    });

    it("doesn't send an incomplete form", async () => {
        const { result } = renderForm();
        act(() => result.current.setField('name', 'ערב'));

        let saved = true;
        await act(async () => { saved = await result.current.submit(); });

        expect(saved).toBe(false);
        expect(createShiftDefinition).not.toHaveBeenCalled();
    });

    it('keeps the values and shows the error when the save fails, until reset', async () => {
        vi.mocked(updateShiftDefinition).mockRejectedValue(new Error('boom'));
        const { result, invalidate } = renderForm();
        act(() => result.current.startEdit(MORNING));

        await act(() => result.current.submit());

        // The mutation's error state lands on a later tick
        await vi.waitFor(() => expect(result.current.error).toBe('אירעה שגיאה לא צפויה. נסה שוב.'));
        expect(result.current.values.name).toBe('בוקר');
        expect(invalidate).not.toHaveBeenCalled();

        act(() => result.current.reset());
        await vi.waitFor(() => expect(result.current.error).toBeNull());
        expect(result.current.isEditMode).toBe(false);
    });
});
