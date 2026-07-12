/**
 * Premium purchase state machine (Phase 7J.4) — pure, SDK-free, testable.
 *
 * The single source of truth for what the Premium screen may show. Two invariants
 * it must never violate:
 *   1. SERVER CONFIRMS UNLOCK — an SDK "purchased" result moves to `finalizing`,
 *      NEVER straight to `ready_premium`. Only a server entitlement that reports
 *      premium flips to `ready_premium`.
 *   2. NEUTRAL CANCEL — a cancelled purchase is `cancelled` (then back to ready),
 *      never `error`.
 * Plus: single-flight purchase/restore (duplicate taps collapse), and any account
 * switch / sign-out resets to a clean state so User B never inherits User A.
 */

import type { OfferingContract, OfferingUnavailable, PurchaseOutcome, RestoreOutcome } from './types';

export type PremiumState =
  | 'idle'
  | 'loading_entitlement'
  | 'loading_offering'
  | 'ready_free'
  | 'ready_premium'
  | 'purchasing'
  | 'cancelled'
  | 'finalizing'
  | 'restoring'
  | 'nothing_to_restore'
  | 'sync_delayed'
  | 'conflict'
  | 'store_unavailable'
  | 'unsupported_platform'
  | 'network_error'
  | 'error';

export interface PremiumContext {
  state: PremiumState;
  isPremium: boolean;
  offering: OfferingContract | null;
  offeringError: OfferingUnavailable | null;
  /** A safe, non-identifying diagnostic reference for support (never a provider id). */
  diagnosticRef: string | null;
}

export type PremiumEvent =
  | { type: 'START'; supported: boolean }
  | { type: 'ENTITLEMENT_LOADED'; isPremium: boolean }
  | { type: 'ENTITLEMENT_FAILED' }
  | { type: 'OFFERING_LOADED'; offering: OfferingContract }
  | { type: 'OFFERING_FAILED'; reason: OfferingUnavailable }
  | { type: 'PURCHASE_START' }
  | { type: 'PURCHASE_RESULT'; outcome: PurchaseOutcome }
  | { type: 'SYNC_CONFIRMED' }
  | { type: 'SYNC_TIMEOUT'; ref: string }
  | { type: 'RESTORE_START' }
  | { type: 'RESTORE_RESULT'; outcome: RestoreOutcome }
  | { type: 'RETRY' }
  | { type: 'DISMISS_TRANSIENT' } // clear cancelled/nothing_to_restore back to ready
  | { type: 'ACCOUNT_SWITCH' }
  | { type: 'SIGN_OUT' };

export function initialContext(): PremiumContext {
  return { state: 'idle', isPremium: false, offering: null, offeringError: null, diagnosticRef: null };
}

const READY = (ctx: PremiumContext): PremiumState => (ctx.isPremium ? 'ready_premium' : 'ready_free');
/** A purchase/restore is in progress — new taps must be ignored (single-flight). */
const BUSY = new Set<PremiumState>(['purchasing', 'finalizing', 'restoring']);

export function reduce(ctx: PremiumContext, ev: PremiumEvent): PremiumContext {
  switch (ev.type) {
    case 'ACCOUNT_SWITCH':
    case 'SIGN_OUT':
      // Hard reset — never carry another user's premium/offering across identities.
      return initialContext();

    case 'START':
      if (!ev.supported) return { ...ctx, state: 'unsupported_platform' };
      return { ...initialContext(), state: 'loading_entitlement' };

    case 'ENTITLEMENT_LOADED': {
      const next = { ...ctx, isPremium: ev.isPremium };
      // Load the offering next unless we already have it.
      return { ...next, state: ctx.offering ? READY(next) : 'loading_offering' };
    }
    case 'ENTITLEMENT_FAILED':
      return { ...ctx, state: 'network_error' };

    case 'OFFERING_LOADED':
      return { ...ctx, offering: ev.offering, offeringError: null, state: BUSY.has(ctx.state) ? ctx.state : READY(ctx) };
    case 'OFFERING_FAILED':
      return { ...ctx, offeringError: ev.reason, state: BUSY.has(ctx.state) ? ctx.state : READY(ctx) };

    case 'PURCHASE_START':
      if (BUSY.has(ctx.state)) return ctx;                 // single-flight: collapse duplicate taps
      if (ctx.state !== 'ready_free' && ctx.state !== 'ready_premium') return ctx;
      return { ...ctx, state: 'purchasing', diagnosticRef: null };

    case 'PURCHASE_RESULT': {
      if (ctx.state !== 'purchasing') return ctx;          // ignore stray results
      const o = ev.outcome;
      if (o.status === 'cancelled') return { ...ctx, state: 'cancelled' };          // NEUTRAL cancel
      if (o.status === 'purchased' || o.status === 'pending' || o.status === 'already_active') {
        return { ...ctx, state: 'finalizing' };            // SDK success ⇒ await SERVER confirmation
      }
      if (o.code === 'conflict') return { ...ctx, state: 'conflict' };
      if (o.code === 'network') return { ...ctx, state: 'network_error' };
      if (o.code === 'store_error') return { ...ctx, state: 'store_unavailable' };
      if (o.code === 'unsupported') return { ...ctx, state: 'unsupported_platform' };
      return { ...ctx, state: 'error' };
    }

    case 'SYNC_CONFIRMED':
      // Only route to premium if we were finalizing/restoring; server is authoritative.
      if (ctx.state !== 'finalizing' && ctx.state !== 'restoring' && ctx.state !== 'sync_delayed') return ctx;
      return { ...ctx, isPremium: true, state: 'ready_premium' };
    case 'SYNC_TIMEOUT':
      if (ctx.state !== 'finalizing' && ctx.state !== 'restoring') return ctx;
      return { ...ctx, state: 'sync_delayed', diagnosticRef: ev.ref };

    case 'RESTORE_START':
      if (BUSY.has(ctx.state)) return ctx;
      return { ...ctx, state: 'restoring', diagnosticRef: null };
    case 'RESTORE_RESULT': {
      if (ctx.state !== 'restoring') return ctx;
      const o = ev.outcome;
      if (o.status === 'restored') return { ...ctx, state: 'finalizing' };          // still await server
      if (o.status === 'nothing_to_restore') return { ...ctx, state: 'nothing_to_restore' };
      if (o.status === 'conflict') return { ...ctx, state: 'conflict' };
      if (o.code === 'network') return { ...ctx, state: 'network_error' };
      return { ...ctx, state: 'store_unavailable' };
    }

    case 'RETRY':
      return { ...ctx, state: 'loading_entitlement', offeringError: null, diagnosticRef: null };
    case 'DISMISS_TRANSIENT':
      if (['cancelled', 'nothing_to_restore', 'sync_delayed', 'conflict', 'network_error', 'store_unavailable', 'error'].includes(ctx.state)) {
        return { ...ctx, state: READY(ctx) };
      }
      return ctx;
  }
}

/** Whether Premium features (Archives) may be shown — only when the SERVER says premium. */
export function premiumUnlocked(ctx: PremiumContext): boolean {
  return ctx.state === 'ready_premium' && ctx.isPremium === true;
}
