/**
 * Premium controller (Phase 7J.7) — the ONE hook the Premium screen uses.
 *
 * Drives the tested `premiumMachine` from the real RevenueCatService, the
 * authoritative server entitlement (`get_my_entitlements`), and the
 * `revenuecat-reconcile` Edge Function. Enforces the hard rules:
 *   • An SDK "purchased" result NEVER unlocks Premium — only a SERVER-confirmed
 *     entitlement does (bounded reconcile + poll).
 *   • Cancellation is neutral (never an error).
 *   • Purchase/restore are single-flight (duplicate taps collapse).
 *   • An account switch aborts in-flight work and resets all state (no A→B bleed).
 * No receipt, purchase token, transaction id or provider customer id ever enters
 * React state or a log.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { getSupabase } from '../../infrastructure/supabase/client';
import { peekEntitlements, refreshEntitlements, resetEntitlementsForIdentityChange } from '../entitlementService';
import type { ValidEntitlements } from '../validate';
import { analytics } from '../analytics';
import { getRevenueCatService } from './index';
import { purchasesCapability } from './platform';
import { initialContext, premiumUnlocked, reduce, type PremiumContext, type PremiumEvent, type PremiumState } from './premiumMachine';
import { backoffFor, decideSync, makeDiagnosticRef, MAX_SYNC_ATTEMPTS } from './serverSync';
import type { OfferingContract, OfferingUnavailable } from './types';

const PREMIUMISH = ['premium', 'grace_period', 'billing_issue'];
const isPremiumState = (e: ValidEntitlements | null) => !!e && PREMIUMISH.includes(e.entitlementState);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PremiumController {
  state: PremiumState;
  isPremium: boolean;
  entitlement: ValidEntitlements | null;
  offering: OfferingContract | null;
  offeringError: OfferingUnavailable | null;
  selected: 'monthly' | 'annual' | null;
  diagnosticRef: string | null;
  /** False on web / Expo Go / missing public key — purchases cannot run. */
  supported: boolean;
  choose(plan: 'monthly' | 'annual'): void;
  /** Buy the chosen plan (or the one passed explicitly). Single-flight. */
  purchase(plan?: 'monthly' | 'annual'): void;
  restore(): void;
  retryOffering(): void;
  retrySync(): void;
  dismiss(): void;
}

export function usePremiumController(enabled: boolean, authUserId: string | null): PremiumController {
  const [ctx, dispatch] = useReducer((c: PremiumContext, e: PremiumEvent) => reduce(c, e), initialContext());
  const [entitlement, setEntitlement] = useState<ValidEntitlements | null>(null);
  const [selected, setSelected] = useState<'monthly' | 'annual' | null>(null);

  const supported = purchasesCapability().supported && !!getRevenueCatService();
  const owner = useRef<string | null>(null);   // identity guard: stale work is discarded
  const busy = useRef(false);                  // single-flight purchase/restore

  /** Reconcile server-side, then poll get_my_entitlements with bounded backoff. */
  const awaitServerPremium = useCallback(async (who: string | null) => {
    for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt++) {
      if (owner.current !== who) return;                         // account switched → abort
      try { await getSupabase().functions.invoke('revenuecat-reconcile', { body: {} }); } catch { /* best-effort */ }
      let ent: ValidEntitlements | null = null;
      try { ent = await refreshEntitlements(); } catch { /* keep polling */ }
      if (owner.current !== who) return;
      if (ent) setEntitlement(ent);
      const decision = decideSync(isPremiumState(ent), attempt, owner.current !== who);
      if (decision === 'confirmed') {
        dispatch({ type: 'SYNC_CONFIRMED' });
        analytics.track('purchase_server_confirmed');
        return;
      }
      if (decision === 'timeout') break;
      await sleep(backoffFor(attempt));
    }
    if (owner.current !== who) return;
    dispatch({ type: 'SYNC_TIMEOUT', ref: makeDiagnosticRef(who ?? 'anon', Date.now()) });
    analytics.track('purchase_sync_delayed');
  }, []);

  /** Load the authoritative entitlement, then the offering. */
  const load = useCallback(async (who: string | null) => {
    dispatch({ type: 'START', supported });
    if (!supported) return;
    const svc = getRevenueCatService();
    try {
      if (who && svc) await svc.configure(who);                  // App User ID = Supabase UUID
      let ent: ValidEntitlements | null = null;
      try {
        ent = await refreshEntitlements();
      } catch {
        // A forced refresh can lose a race with the auth-token lock on a cold
        // open. The cached entitlement is still authoritative server state — fall
        // back to it rather than showing a scary "couldn't reach the server".
        ent = peekEntitlements();
        if (!ent) throw new Error('no_entitlement');
      }
      if (owner.current !== who) return;
      setEntitlement(ent);
      dispatch({ type: 'ENTITLEMENT_LOADED', isPremium: isPremiumState(ent) });
    } catch {
      if (owner.current !== who) return;
      dispatch({ type: 'ENTITLEMENT_FAILED' });
      return;
    }
    try {
      const res = await svc!.getOfferings();
      if (owner.current !== who) return;
      if ('offering' in res) {
        dispatch({ type: 'OFFERING_LOADED', offering: res.offering });
        analytics.track('offering_loaded');
      } else {
        dispatch({ type: 'OFFERING_FAILED', reason: res.unavailable });
        analytics.track('offering_unavailable', { properties: { outcome: res.unavailable } });
      }
    } catch {
      if (owner.current !== who) return;
      dispatch({ type: 'OFFERING_FAILED', reason: 'store_unavailable' });
    }
  }, [supported]);

  // Identity change → hard reset (no cross-account Premium/offering bleed).
  useEffect(() => {
    if (owner.current !== authUserId) {
      owner.current = authUserId;
      busy.current = false;
      resetEntitlementsForIdentityChange();
      setEntitlement(null);
      setSelected(null);
      dispatch({ type: 'ACCOUNT_SWITCH' });
    }
    if (enabled) void load(authUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, authUserId]);

  const purchase = useCallback((plan?: 'monthly' | 'annual') => {
    const svc = getRevenueCatService();
    const want = plan ?? selected;
    const pkg = ctx.offering?.packages.find((p) => p.plan === want);
    if (!svc || !pkg || busy.current) return;                    // single-flight
    if (plan) setSelected(plan);
    busy.current = true;
    const who = owner.current;
    dispatch({ type: 'PURCHASE_START' });
    analytics.track('purchase_started', { properties: { package_type: pkg.plan } });
    void (async () => {
      try {
        const outcome = await svc.purchase(pkg.packageId);
        if (owner.current !== who) return;
        dispatch({ type: 'PURCHASE_RESULT', outcome });
        if (outcome.status === 'cancelled') analytics.track('purchase_cancelled');
        else if (outcome.status === 'purchased' || outcome.status === 'pending' || outcome.status === 'already_active') {
          analytics.track('purchase_sdk_succeeded', { properties: { package_type: pkg.plan } });
          await awaitServerPremium(who);                         // SERVER confirms, not the SDK
        }
      } finally {
        busy.current = false;
      }
    })();
  }, [ctx.offering, selected, awaitServerPremium]);

  const restore = useCallback(() => {
    const svc = getRevenueCatService();
    if (!svc || busy.current) return;
    busy.current = true;
    const who = owner.current;
    dispatch({ type: 'RESTORE_START' });
    analytics.track('restore_started');
    void (async () => {
      try {
        const outcome = await svc.restore();
        if (owner.current !== who) return;
        dispatch({ type: 'RESTORE_RESULT', outcome });
        if (outcome.status === 'restored') { analytics.track('restore_completed'); await awaitServerPremium(who); }
        else if (outcome.status === 'nothing_to_restore') analytics.track('restore_nothing_found');
        else if (outcome.status === 'conflict') analytics.track('restore_conflict');
      } finally {
        busy.current = false;
      }
    })();
  }, [awaitServerPremium]);

  return {
    state: ctx.state,
    isPremium: premiumUnlocked(ctx) || isPremiumState(entitlement),
    entitlement,
    offering: ctx.offering,
    offeringError: ctx.offeringError,
    selected,
    diagnosticRef: ctx.diagnosticRef,
    supported,
    choose: setSelected,
    purchase,
    restore,
    retryOffering: () => { dispatch({ type: 'RETRY' }); void load(owner.current); },
    // Stays in `sync_delayed` while it re-reconciles; SYNC_CONFIRMED promotes it.
    retrySync: () => { void awaitServerPremium(owner.current); },
    dismiss: () => dispatch({ type: 'DISMISS_TRANSIENT' }),
  };
}
