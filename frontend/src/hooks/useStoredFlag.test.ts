import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useStoredFlag } from './useStoredFlag';

const KEY = 'test.flag';

describe('useStoredFlag', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('starts from the default when nothing is stored', () => {
        const { result } = renderHook(() => useStoredFlag(KEY, true));

        expect(result.current[0]).toBe(true);
    });

    it('starts from the stored value', () => {
        localStorage.setItem(KEY, '0');

        const { result } = renderHook(() => useStoredFlag(KEY, true));

        expect(result.current[0]).toBe(false);
    });

    it('updates and remembers the value', () => {
        const { result } = renderHook(() => useStoredFlag(KEY, true));

        act(() => result.current[1](false));
        expect(result.current[0]).toBe(false);
        expect(localStorage.getItem(KEY)).toBe('0');

        act(() => result.current[1](true));
        expect(result.current[0]).toBe(true);
        expect(localStorage.getItem(KEY)).toBe('1');
    });
});
