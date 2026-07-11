/**
 * usePremium (Phase 7E) — the Premium/paywall screen's controller.
 *
 * Composes the SDK service (offerings, purchase, restore) with the AUTHORITATIVE
 * server entitlement. After a store purchase succeeds it enters a bounded
 * "finalizing" wait, polling the server (webhook → sync) until get_my_entitlements
 * reports Premium — the client never unlocks a protected feature from the SDK
 * result alone. On web / unsupported platforms it resolves to a safe state and
 * never renders a purchase control.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { analytics } from '../analytics';
import { currentIdentity } from '../identity';
import { refreshEntitlements } from '../entitlementService';
import type { ValidEntitlements } from '../validate';
import { getRevenueCatService, purchasesCapability } from './index';
import type { OfferingContract, OfferingUnavailable } from './types';

export type PremiumPhase = 'idle' | 'loading' | 'ready' | 'unsupported' | 'error';

export interface PremiumView {
  supported: boolean;
  unavailableReason: OfferingUnavailable | null;
  phase: PremiumPhase;
  offering: OfferingContract | null;
  entitlement: ValidEntitlements | null;
  busy: boolean;
  finalizing: boolean;
  /** A calm, user-safe status message (never a raw SDK error). */
  message: string | null;
  purchase: (packageId: string) => void;
  restore: () => void;
  refresh: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isPremiumState = (e: ValidEntitlements | null) =>
  e != null && ['premium', 'grace_period', 'billing_issue'].includes(e.entitlementState);

export function usePremium(enabled: boolean): PremiumView {
  const cap = purchasesCapability();
  const svc = getRevenueCatService();
  const [phase, setPhase] = useState<PremiumPhase>(cap.supported ? 'idle' : 'unsupported');
  const [offering, setOffering] = useState<OfferingContract | null>(null);
  const [reason, setReason] = useState<OfferingUnavailable | null>(cap.supported ? null : cap.reason);
  const [entitlement, setEntitlement] = useState<ValidEntitlements | null>(null);
  const [busy, setBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(async () => {
    if (!enabled || !svc) return;
    setPhase((p) => (offering ? p : 'loading'));
    const id = currentIdentity()?.userId;
    if (!id) { setPhase('error'); return; }
    try {
      await svc.configure(id);
      const res = await svc.getOfferings();
      if ('offering' in res) { setOffering(res.offering); setReason(null); }
      else { setOffering(null); setReason(res.unavailable); }
      setEntitlement(await refreshEntitlements());
      setPhase('ready');
    } catch {
      setPhase((p) => (offering ? p : 'error'));
    }
  }, [enabled, svc, offering]);

  useEffect(() => {
    if (enabled && !started.current) { started.current = true; analytics.track('premium_preview_viewed'); void load(); }
  }, [enabled, load]);

  // Poll the server up to ~20s for the webhook→sync to land, then report.
  const finalize = useCallback(async () => {
    setFinalizing(true);
    setMessage('We’re finalizing your access…');
    for (let i = 0; i < 8; i++) {
      try {
        const e = await refreshEntitlements();
        setEntitlement(e);
        if (isPremiumState(e)) {
          setFinalizing(false);
          setMessage('Premium is active. Thank you!');
          return;
        }
      } catch { /* keep waiting */ }
      await sleep(2500);
    }
    setFinalizing(false);
    setMessage('Your purchase went through — access is being activated. Pull to refresh in a moment.');
  }, []);

  const purchase = useCallback((packageId: string) => {
    if (!svc || busy) return;
    analytics.track('purchase_requested');
    setBusy(true); setMessage(null);
    void (async () => {
      try {
        const out = await svc.purchase(packageId);
        if (out.status === 'purchased') { await finalize(); }
        else if (out.status === 'cancelled') { setMessage(null); } // NOT an error
        else if (out.status === 'pending') { await finalize(); }
        else if (out.status === 'already_active') { setMessage('Premium is already active.'); }
        else if (out.status === 'error') {
          setMessage(out.code === 'conflict'
            ? 'This purchase is linked to a different BrainBrew account. Please contact support.'
            : out.code === 'network'
              ? 'Network issue reaching the store. Please try again.'
              : 'The store couldn’t complete the purchase. Please try again.');
        }
      } finally { setBusy(false); }
    })();
  }, [svc, busy, finalize]);

  const restore = useCallback(() => {
    if (!svc || busy) return;
    setBusy(true); setMessage(null);
    void (async () => {
      try {
        const out = await svc.restore();
        if (out.status === 'restored') { await finalize(); }
        else if (out.status === 'nothing_to_restore') { setMessage('No previous purchase was found for this account.'); }
        else if (out.status === 'conflict') { setMessage('That purchase belongs to a different BrainBrew account. Please contact support — we won’t move it automatically.'); }
        else { setMessage('We couldn’t restore right now. Please try again.'); }
      } finally { setBusy(false); }
    })();
  }, [svc, busy, finalize]);

  return {
    supported: cap.supported,
    unavailableReason: reason,
    phase,
    offering,
    entitlement,
    busy,
    finalizing,
    message,
    purchase,
    restore,
    refresh: () => void load(),
  };
}
