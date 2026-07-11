import { useCallback, useRef } from 'react';

/**
 * Milliseconds since this component mounted. The session host remounts each
 * engine by key, so the clock starts when the puzzle appears and stops when the
 * engine reports its answer — the reveal card's reading time is never counted.
 *
 * Used by the four engines whose puzzle *is* the thing you read: for those,
 * reading the question is solving it. Attention Speed does not use this hook —
 * there, reading the brief precedes a timed sprint, so it runs its own clock
 * that starts on the Begin tap.
 *
 * Phase 0 only: Core Spec §9 says the server owns timing and a client-reported
 * timer is never trusted. This exists so the loop is playable, and is the first
 * thing to delete when scoring moves server-side.
 */
export function useElapsed(): () => number {
  const startedAt = useRef(Date.now());
  return useCallback(() => Date.now() - startedAt.current, []);
}
