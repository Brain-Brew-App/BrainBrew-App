/**
 * Share-card flow hook (Phase 7A).
 *
 * Owns the capture-and-share lifecycle for the Results share action:
 *   • generates the image ONLY when the user taps Share (never automatically);
 *   • caches the captured image for the current result and reuses it on repeat taps;
 *   • invalidates the cache when the result changes or the screen unmounts;
 *   • dedupes rapid taps (one in-flight share at a time);
 *   • emits the four operational share events (dev-only, no storage/analytics).
 *
 * Platform capture/share is resolved by Metro: `shareImage.ts` (native) or
 * `shareImage.web.ts` (web). The BrewScore/Results render is never blocked — this
 * runs only on demand.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { View } from 'react-native';

import { logShareEvent } from './diagnostics';
import { captureCard, shareCardImage, type ShareResult } from './shareImage';

export type SharePhase = 'idle' | 'generating' | 'sharing' | 'done' | 'error';

export interface ShareCardController {
  /** Attach to the ShareCard being captured. */
  ref: React.RefObject<View | null>;
  phase: SharePhase;
  /** Trigger capture + share. Returns the outcome; safe to call repeatedly. */
  share: (text: string, filename: string) => Promise<ShareResult['outcome']>;
}

/**
 * @param resultKey a value that changes when the underlying result changes
 *   (e.g. the snapshot's frozen `generatedAt`), so a new result drops the cache.
 * @param size logical square size of the card being captured.
 */
export function useShareCard(resultKey: string, size = 340): ShareCardController {
  const ref = useRef<View>(null);
  const [phase, setPhase] = useState<SharePhase>('idle');
  const cache = useRef<{ key: string; uri: string } | null>(null);
  const busy = useRef(false);

  // A new result invalidates any cached image.
  useEffect(() => {
    if (cache.current && cache.current.key !== resultKey) {
      cache.current = null;
      setPhase('idle');
    }
  }, [resultKey]);

  // Drop the cache when the screen unmounts (no persistent image cache).
  useEffect(() => () => { cache.current = null; }, []);

  const share = useCallback(async (text: string, filename: string): Promise<ShareResult['outcome']> => {
    if (busy.current) return 'cancelled'; // collapse duplicate rapid taps
    busy.current = true;
    logShareEvent('share_requested');
    try {
      let uri = cache.current?.key === resultKey ? cache.current.uri : null;
      if (!uri) {
        setPhase('generating');
        uri = await captureCard(ref, size);
        cache.current = { key: resultKey, uri };
      }
      setPhase('sharing');
      const res = await shareCardImage(uri, text, filename);
      const failed = res.outcome === 'failed' || res.outcome === 'unsupported';
      setPhase(failed ? 'error' : 'done');
      logShareEvent(res.outcome === 'cancelled' ? 'share_cancelled' : failed ? 'share_failed' : 'share_completed');
      return res.outcome;
    } catch {
      setPhase('error');
      logShareEvent('share_failed');
      return 'failed';
    } finally {
      busy.current = false;
    }
  }, [resultKey, size]);

  return { ref, phase, share };
}
