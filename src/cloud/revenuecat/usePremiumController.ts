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
import { canStartPurchase, initialContext, premiumUnlocked, reduce, type PremiumContext, type PremiumEvent, type PremiumState } from './premiumMachine';
import { backoffFor, decideSync, makeDiagnosticRef, MAX_SYNC_ATTEMPTS } from './serverSync';
import type { OfferingContract, OfferingUnavailable } from './types';

declare const __DEV__: boolean | undefined;

const PREMIUMISH = ['premium', 'grace_period', 'billing_issue'];
const isPremiumState = (e: ValidEntitlements | null) => !!e && PREMIUMISH.includes(e.entitlementState);
const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/** Cold-open auth-lock contention clears in well under a second; 3 tries is ample. */
const ENTITLEMENT_ATTEMPTS = 3;
const ENTITLEMENT_BACKOFF_MS = [400, 1200];

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
  // `undefined` = never mounted yet (NOT an account switch). null = signed out.
  const owner = useRef<string | null | undefined>(undefined);
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

  /**
   * The authoritative entitlement read, with a bounded retry.
   *
   * On a cold open the Supabase auth-token lock is contended (the session restore,
   * the daily-pack fetch and this read all start at once), so the FIRST attempt can
   * lose the race and reject even though the network and the server are healthy.
   * Treating that as "we couldn't reach the server" is simply wrong, and it left
   * the paywall permanently dead. Retry briefly, prefer any cached server state,
   * and only then report a real failure.
   */
  const loadEntitlement = useCallback(async (who: string | null): Promise<ValidEntitlements | null> => {
    for (let attempt = 0; attempt < ENTITLEMENT_ATTEMPTS; attempt++) {
      if (owner.current !== who) return null;
      try {
        return await refreshEntitlements();
      } catch (e) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          const err = e as { name?: string; code?: string; message?: string };
          console.warn(`[premium] entitlement attempt ${attempt + 1} failed · ${err?.name ?? '?'} · ${err?.code ?? ''} · ${err?.message ?? ''}`);
        }
        const cached = peekEntitlements();       // already-known server state wins
        if (cached) return cached;
        if (attempt < ENTITLEMENT_ATTEMPTS - 1) await sleep(ENTITLEMENT_BACKOFF_MS[attempt]);
      }
    }
    return null;
  }, []);

  /** Load the authoritative entitlement, then the offering. */
  const load = useCallback(async (who: string | null) => {
    dispatch({ type: 'START', supported });
    if (!supported) return;
    const svc = getRevenueCatService();
    try {
      if (who && svc) await svc.configure(who);                  // App User ID = Supabase UUID
      const ent = await loadEntitlement(who);
      if (owner.current !== who) return;
      if (!ent) { dispatch({ type: 'ENTITLEMENT_FAILED' }); return; }
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
  //
  // The `undefined` sentinel matters. `owner` used to start as `null`, so on the
  // FIRST mount `owner.current !== authUserId` was always true and every open of
  // the Premium screen was treated as an account switch: it wiped the shared
  // entitlement cache (which now emits to every reader), forced a fresh
  // get_my_entitlements round trip, and left capabilities transiently null
  // app-wide. If that reload then failed, a paying user could walk from Premium
  // into a LOCKED Archives screen. A first mount is not a switch.
  useEffect(() => {
    const first = owner.current === undefined;
    if (!first && owner.current !== authUserId) {
      busy.current = false;
      resetEntitlementsForIdentityChange();
      setEntitlement(null);
      setSelected(null);
      dispatch({ type: 'ACCOUNT_SWITCH' });
    }
    owner.current = authUserId;
    if (enabled) void load(authUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, authUserId]);

  const purchase = useCallback((plan?: 'monthly' | 'annual') => {
    const svc = getRevenueCatService();
    const want = plan ?? selected;
    const pkg = ctx.offering?.packages.find((p) => p.plan === want);
    if (!svc || !pkg || busy.current) return;                    // single-flight
    // Never run a real (chargeable) SDK purchase the machine would ignore — that
    // would charge the user while the UI showed no progress at all.
    if (!canStartPurchase(ctx)) return;
    if (plan) setSelected(plan);
    busy.current = true;
    const who = owner.current ?? null;
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
  }, [ctx, selected, awaitServerPremium]);

  const restore = useCallback(() => {
    const svc = getRevenueCatService();
    if (!svc || busy.current) return;
    busy.current = true;
    const who = owner.current ?? null;
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
    retryOffering: () => { dispatch({ type: 'RETRY' }); void load(owner.current ?? null); },
    // Stays in `sync_delayed` while it re-reconciles; SYNC_CONFIRMED promotes it.
    retrySync: () => { void awaitServerPremium(owner.current ?? null); },
    dismiss: () => dispatch({ type: 'DISMISS_TRANSIENT' }),
  };
}
