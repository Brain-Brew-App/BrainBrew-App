import { useCallback, useEffect, useRef, useState } from 'react';

const TICK_MS = 100;

export type TaskPhase = 'ready' | 'playing';

/**
 * The Attention Speed clock, shared by every timed engine.
 *
 * The task is gated: while `phase` is `'ready'` nothing ticks and no clock
 * exists, so reading the brief can never cost points — reading speed is not the
 * thing being measured (Core Spec §3). The clock starts on `begin()`, not on
 * mount.
 *
 * Extracted from `SymbolSweepEngine` when `RapidClassificationEngine` needed the
 * identical gate-and-countdown; both engines now share one implementation of the
 * rule that matters most in this category.
 */
export function useTimedTask(durationMs: number, frozen: boolean, onExpire: () => void) {
  const [phase, setPhase] = useState<TaskPhase>('ready');
  const [remainingMs, setRemainingMs] = useState(durationMs);

  /** Set once, on begin(). Null while the brief is on screen. */
  const startedAt = useRef<number | null>(null);
  const elapsed = useCallback(
    () => (startedAt.current === null ? 0 : Date.now() - startedAt.current),
    [],
  );

  // Kept in a ref so a caller re-creating the callback each render does not
  // restart the interval.
  const expire = useRef(onExpire);
  expire.current = onExpire;

  const begin = useCallback(() => {
    startedAt.current = Date.now();
    setRemainingMs(durationMs);
    setPhase('playing');
  }, [durationMs]);

  useEffect(() => {
    if (phase !== 'playing' || frozen) return;
    const id = setInterval(() => {
      const left = durationMs - elapsed();
      setRemainingMs(Math.max(0, left));
      if (left <= 0) expire.current();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [durationMs, elapsed, frozen, phase]);

  return { phase, remainingMs, begin, elapsed };
}
