/**
 * Entitlement hook (Phase 7D) — cache-first, non-blocking.
 *
 * Feeds the Premium-preview surfaces (Profile card, Premium info screen) with the
 * player's real capability set. It NEVER gates the core Home/pack/ranked path: the
 * beta policy already returns before any await, and every Premium capability is
 * off, so nothing here can hide or block current play.
 *
 * Cloud mode fetches once and caches for the session; local mode resolves the
 * explicit local policy synchronously (no network).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { isCloudMode } from './env';
import { LOCAL_DEV_ENTITLEMENTS } from './entitlements';
import { cachedEntitlements } from './entitlementData';
import { getEntitlements, refreshEntitlements } from './entitlementService';
import type { ValidEntitlements } from './validate';

export type EntitlementPhase = 'idle' | 'loading' | 'ready' | 'error';

export interface EntitlementView {
  phase: EntitlementPhase;
  entitlements: ValidEntitlements | null;
  refresh: () => void;
}

function initial(): ValidEntitlements | null {
  return isCloudMode() ? cachedEntitlements() : LOCAL_DEV_ENTITLEMENTS;
}

export function useEntitlements(enabled: boolean): EntitlementView {
  const [entitlements, setEntitlements] = useState<ValidEntitlements | null>(() => initial());
  const [phase, setPhase] = useState<EntitlementPhase>(() => (initial() ? 'ready' : 'idle'));
  const inFlight = useRef(false);

  const load = useCallback(async (force: boolean) => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    setPhase((p) => (entitlements ? p : 'loading'));
    try {
      setEntitlements(force ? await refreshEntitlements() : await getEntitlements());
      setPhase('ready');
    } catch {
      setPhase((p) => (entitlements ? p : 'error'));
    } finally {
      inFlight.current = false;
    }
  }, [enabled, entitlements]);

  useEffect(() => {
    if (enabled) void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { phase, entitlements, refresh: () => void load(true) };
}
