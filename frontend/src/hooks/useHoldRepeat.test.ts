import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHoldRepeat } from './useHoldRepeat';

const renderHold = () => renderHook(() => useHoldRepeat());

describe('useHoldRepeat', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('runs the step once right away', () => {
        const { result } = renderHold();
        const step = vi.fn(() => true);

        act(() => result.current.start(step));

        expect(step).toHaveBeenCalledTimes(1);
    });

    it('repeats every 60 ms after a 400 ms hold', () => {
        const { result } = renderHold();
        const step = vi.fn(() => true);
        act(() => result.current.start(step));

        vi.advanceTimersByTime(399);
        expect(step).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1 + 60);
        expect(step).toHaveBeenCalledTimes(2);

        vi.advanceTimersByTime(120);
        expect(step).toHaveBeenCalledTimes(4);
    });

    it('sets no timer when the first step returns false', () => {
        const { result } = renderHold();

        act(() => result.current.start(() => false));

        expect(vi.getTimerCount()).toBe(0);
    });

    it('stops repeating once the step returns false', () => {
        const { result } = renderHold();
        let calls = 0;
        const step = vi.fn(() => ++calls < 3);
        act(() => result.current.start(step));

        vi.advanceTimersByTime(400 + 60 * 5);

        expect(step).toHaveBeenCalledTimes(3);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('stops on stop()', () => {
        const { result } = renderHold();
        const step = vi.fn(() => true);
        act(() => result.current.start(step));
        vi.advanceTimersByTime(460);

        act(() => result.current.stop());
        vi.advanceTimersByTime(1000);

        expect(step).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['pointerup', 'pointercancel', 'blur'])('stops on a window %s', (eventName) => {
        const { result } = renderHold();
        const step = vi.fn(() => true);
        act(() => result.current.start(step));
        vi.advanceTimersByTime(460);

        window.dispatchEvent(new Event(eventName));
        vi.advanceTimersByTime(1000);

        expect(step).toHaveBeenCalledTimes(2);
    });

    it('replaces the hold when started again', () => {
        const { result } = renderHold();
        const first = vi.fn(() => true);
        const second = vi.fn(() => true);
        act(() => result.current.start(first));
        vi.advanceTimersByTime(300);

        act(() => result.current.start(second));
        vi.advanceTimersByTime(460);

        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(1);
    });

    it('clears its timers on unmount', () => {
        const { result, unmount } = renderHold();
        act(() => result.current.start(() => true));
        vi.advanceTimersByTime(460);

        unmount();

        expect(vi.getTimerCount()).toBe(0);
    });
});
