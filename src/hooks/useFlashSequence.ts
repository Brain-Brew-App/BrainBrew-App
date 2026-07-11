import { useCallback, useEffect, useRef, useState } from 'react';

export type FlashPhase = 'ready' | 'exposure' | 'interval' | 'select';

/**
 * The Memory Flash clock: brief → exposure → neutral pause → selection.
 *
 * Two rules from the catalog live here, not in the engine:
 *
 *  1. **Nothing is timed until the player can act.** The exposure and the pause
 *     are excluded from the clock, because the player cannot do anything during
 *     them. `elapsed()` measures selection time only, and starts the instant the
 *     board appears.
 *
 *  2. **The pause is never a flash.** This hook only reports a phase; the engine
 *     renders the *same container* throughout and merely empties it. There is no
 *     white frame to accidentally introduce, because there is no frame swap at
 *     all — a §13 hard requirement made structural rather than remembered.
 */
export function useFlashSequence(exposureMs: number, intervalMs: number, frozen: boolean) {
  const [phase, setPhase] = useState<FlashPhase>('ready');

  /** Set when the board appears. Null until then. */
  const selectStartedAt = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const elapsed = useCallback(
    () => (selectStartedAt.current === null ? 0 : Date.now() - selectStartedAt.current),
    [],
  );

  const clear = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };

  const begin = useCallback(() => {
    if (frozen) return;
    clear();
    setPhase('exposure');

    timers.current.push(
      setTimeout(() => setPhase('interval'), exposureMs),
      setTimeout(() => {
        selectStartedAt.current = Date.now();
        setPhase('select');
      }, exposureMs + intervalMs),
    );
  }, [exposureMs, frozen, intervalMs]);

  // A puzzle that unmounts mid-exposure must not fire into a dead component.
  useEffect(() => clear, []);

  return { phase, begin, elapsed };
}
