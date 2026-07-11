/**
 * The cloud identity + profile gate (Phase 5B, extended in 5C). Runs ONLY in
 * cloud mode: it bootstraps/restores the Auth session (anonymous or, after
 * upgrade/recovery, permanent), processes an email-upgrade callback, keeps
 * `profiles.account_type` synced from verified Auth, loads the profile, and
 * decides whether onboarding is required. Screens read `phase` and call the
 * service boundary; they never call `supabase.auth` directly.
 *
 * Local mode passes `enabled = false` and this hook is inert — no Auth, no
 * network.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { processAuthCallback, signOutPermanent, syncAccountType } from './accountUpgrade';
import { analytics } from './analytics';
import { resetEntitlementsForIdentityChange } from './entitlementService';
import { getRevenueCatService } from './revenuecat';
import { currentIdentity } from './identity';
import { errorCopy, type ErrorCopy } from './errors';
import { _resetIdentityCache, bootstrapIdentity, type IdentityPhase } from './identity';
import { getMyProfile, type Profile } from './profileApi';

export type IdentityUiPhase = 'loading' | 'onboarding' | 'ready' | 'account_entry' | 'error';

export interface CloudIdentityView {
  phase: IdentityUiPhase;
  profile: Profile | null;
  error: (ErrorCopy & { code: string }) | null;
  retry(): void;
  /** Reload profile + sync account_type (after onboarding or an upgrade completes). */
  refresh(): void;
  /** Sign out a PERMANENT account → account-entry (never auto-creates a guest). */
  signOut(): void;
  /** From account-entry: start fresh as a new anonymous guest. */
  continueAsGuest(): void;
}

export function useCloudIdentity(enabled: boolean): CloudIdentityView {
  const [phase, setPhase] = useState<IdentityUiPhase>(enabled ? 'loading' : 'ready');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<(ErrorCopy & { code: string }) | null>(null);
  const inFlight = useRef(false);

  const loadProfile = useCallback(async () => {
    // account_type is server-controlled: sync it from the verified Auth claim
    // (idempotent) before reading, so an upgrade is reflected immediately.
    await syncAccountType();
    const p = await getMyProfile();
    setProfile(p);
    setPhase(p && p.onboarding_status === 'complete' ? 'ready' : 'onboarding');
  }, []);

  const run = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setPhase('loading');
    try {
      await bootstrapIdentity((_p: IdentityPhase) => {});
      // If we arrived via an email-confirmation redirect (web), finish it.
      await processAuthCallback().catch(() => undefined);
      // Analytics: bind the session context + record the app-open (fire-and-forget).
      analytics.setSessionContext(currentIdentity()?.installId ?? 'nosession');
      analytics.track('app_opened');
      await loadProfile();
    } catch {
      setError({ ...errorCopy('network_error'), code: 'identity_error' });
      setPhase('error');
    } finally {
      inFlight.current = false;
    }
  }, [enabled, loadProfile]);

  useEffect(() => {
    void run();
  }, [run]);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        await loadProfile();
      } catch {
        setError({ ...errorCopy('network_error'), code: 'identity_error' });
        setPhase('error');
      }
    })();
  }, [loadProfile]);

  const signOut = useCallback(() => {
    void (async () => {
      const r = await signOutPermanent();
      if (r.ok) {
        resetEntitlementsForIdentityChange(); // the next player must not inherit this one's capabilities
      analytics.clearIdentityContext();
        await getRevenueCatService()?.logOutOrSwitch().catch(() => {}); // clear store identity too
        setProfile(null);
        setPhase('account_entry');
      }
    })();
  }, []);

  const continueAsGuest = useCallback(() => {
    void (async () => {
      _resetIdentityCache();
      resetEntitlementsForIdentityChange(); // fresh guest → fresh capability read
      await getRevenueCatService()?.logOutOrSwitch().catch(() => {}); // detach store identity
      await run();
    })();
  }, [run]);

  return {
    phase,
    profile,
    error,
    retry: () => void run(),
    refresh,
    signOut,
    continueAsGuest,
  };
}
