import { afterEach, vi } from "vitest";

/**
 * Opt-in fake clock helper. Tests that need determinism call
 * `useFixedClock("2026-04-16T12:00:00Z")`.
 */
export function useFixedClock(iso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
});
