/**
 * Deterministic RevenueCat subscriber → BrainBrew entitlement mapping (Phase 7E).
 *
 * Pure and platform-free (no Deno/Node globals beyond `Date`), so it runs
 * identically inside the webhook Edge Function and inside the Node mapping test.
 * The webhook, after receiving an event, fetches the AUTHORITATIVE subscriber
 * state from RevenueCat and passes it here — we never derive state from the raw
 * event body. One canonical representation, mapped one way.
 *
 * State model: premium | grace_period | billing_issue | expired | revoked | free.
 * Trial and introductory periods are ACTIVE → premium (the period_type is carried
 * for UI, but never changes ranked fairness). Nothing here can affect ranked play.
 */

export type EntitlementState =
  | 'premium' | 'grace_period' | 'billing_issue' | 'expired' | 'revoked' | 'free';

/** The subset of the RevenueCat REST subscriber object we read. */
export interface RcSubscriber {
  entitlements?: Record<string, RcEntitlement>;
  subscriptions?: Record<string, RcSubscription>;
}
export interface RcEntitlement {
  product_identifier?: string;
  purchase_date?: string | null;
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
}
export interface RcSubscription {
  store?: string;
  period_type?: string;              // normal | trial | intro
  purchase_date?: string | null;
  original_purchase_date?: string | null;
  expires_date?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  grace_period_expires_date?: string | null;
  refunded_at?: string | null;
}

export interface MappedEntitlement {
  state: EntitlementState;
  fields: {
    revenuecat_entitlement_id: string | null;
    revenuecat_product_id: string | null;
    revenuecat_store: string | null;
    is_active: boolean;
    will_renew: boolean;
    period_type: string | null;
    purchased_at: string | null;
    original_purchased_at: string | null;
    current_period_end: string | null;
    grace_period_end: string | null;
    unsubscribe_detected_at: string | null;
    billing_issue_detected_at: string | null;
    revoked_at: string | null;
    expiration_reason: string | null;
  };
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/**
 * Map an authoritative subscriber snapshot for one entitlement id.
 * `nowMs` is injected so the mapping is deterministic and testable.
 */
export function mapSubscriber(
  subscriber: RcSubscriber | null | undefined,
  entitlementId: string,
  nowMs: number,
): MappedEntitlement {
  const ent = subscriber?.entitlements?.[entitlementId];
  const productId = ent?.product_identifier ?? null;
  const sub: RcSubscription = (productId && subscriber?.subscriptions?.[productId]) || {};

  const base = {
    revenuecat_entitlement_id: ent ? entitlementId : null,
    revenuecat_product_id: productId,
    revenuecat_store: sub.store ?? null,
    period_type: sub.period_type ?? null,
    purchased_at: ent?.purchase_date ?? sub.purchase_date ?? null,
    original_purchased_at: sub.original_purchase_date ?? null,
    current_period_end: ent?.expires_date ?? sub.expires_date ?? null,
    grace_period_end: ent?.grace_period_expires_date ?? sub.grace_period_expires_date ?? null,
    unsubscribe_detected_at: sub.unsubscribe_detected_at ?? null,
    billing_issue_detected_at: sub.billing_issues_detected_at ?? null,
  };

  // No entitlement present at all → the player is not (and never became) Premium.
  if (!ent) {
    return {
      state: 'free',
      fields: { ...base, is_active: false, will_renew: false, revoked_at: null, expiration_reason: null },
    };
  }

  const expires = ms(base.current_period_end);
  const grace = ms(base.grace_period_end);
  const refunded = sub.refunded_at ?? null;

  // Refund / revocation wins — future Premium is removed (past results untouched).
  if (refunded) {
    return {
      state: 'revoked',
      fields: { ...base, is_active: false, will_renew: false, revoked_at: refunded, expiration_reason: 'refund' },
    };
  }

  // Actively entitled (period not yet ended).
  if (expires !== null && nowMs < expires) {
    const billing = Boolean(base.billing_issue_detected_at);
    const unsub = Boolean(base.unsubscribe_detected_at);
    return {
      state: billing ? 'billing_issue' : 'premium',
      fields: {
        ...base,
        is_active: true,
        will_renew: !unsub && !billing,
        revoked_at: null,
        expiration_reason: null,
      },
    };
  }

  // Period ended but still inside the grace window → keep Premium temporarily.
  if (grace !== null && nowMs < grace) {
    return {
      state: 'grace_period',
      fields: { ...base, is_active: true, will_renew: false, revoked_at: null, expiration_reason: 'billing_issue' },
    };
  }

  // Otherwise the entitlement has lapsed.
  return {
    state: 'expired',
    fields: { ...base, is_active: false, will_renew: false, revoked_at: null, expiration_reason: 'expired' },
  };
}
