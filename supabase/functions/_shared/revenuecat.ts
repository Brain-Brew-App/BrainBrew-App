/**
 * RevenueCat SERVER API boundary (Phase 7E) — Deno / Edge only.
 *
 * The ONLY place the RevenueCat secret API key is used. It is read from a Supabase
 * Function secret and NEVER reaches the client, the database, logs, or git. After
 * a webhook arrives we call this to fetch the AUTHORITATIVE subscriber state and
 * map that — never trusting the webhook body as proof of entitlement.
 *
 * Narrow on purpose: one GET, a hard timeout, response validation, redacted
 * errors, and a clear distinction between "customer genuinely has no entitlement"
 * and "provider call failed" (so a transient outage never silently downgrades a
 * paying player).
 */

import { AppError } from './http.ts';
import type { RcSubscriber } from './entitlementMap.ts';

const RC_BASE = 'https://api.revenuecat.com/v1';
const TIMEOUT_MS = 8000;

export function revenueCatSecret(): string {
  const key = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!key || key.length < 20) throw new AppError('server_misconfigured', 500);
  return key;
}

export function revenueCatEntitlementId(): string {
  return Deno.env.get('REVENUECAT_ENTITLEMENT_ID') ?? 'brainbrew_premium';
}

export interface SubscriberResult {
  /** null when RevenueCat has no such subscriber (treated as no entitlement). */
  subscriber: RcSubscriber | null;
  missing: boolean;
}

/**
 * Fetch a subscriber's current state. `appUserId` must already be a validated
 * Supabase Auth UUID (the webhook validates before calling). Distinguishes a
 * missing customer (404) from a provider failure (throws provider_unavailable).
 */
export async function fetchSubscriber(appUserId: string): Promise<SubscriberResult> {
  const key = revenueCatSecret();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${RC_BASE}/subscribers/${encodeURIComponent(appUserId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    if (res.status === 404) return { subscriber: null, missing: true };
    if (res.status === 401 || res.status === 403) throw new AppError('provider_auth_failed', 502);
    if (res.status === 429) throw new AppError('provider_rate_limited', 503);
    if (!res.ok) throw new AppError('provider_unavailable', 502);

    const body = await res.json().catch(() => null);
    const subscriber = (body && typeof body === 'object' && (body as { subscriber?: unknown }).subscriber) || null;
    if (subscriber && typeof subscriber !== 'object') throw new AppError('provider_bad_response', 502);
    return { subscriber: subscriber as RcSubscriber | null, missing: subscriber === null };
  } catch (err) {
    if (err instanceof AppError) throw err;
    // AbortError / network — a provider failure, NOT "no entitlement". Redacted.
    const name = err instanceof Error ? err.name : 'unknown';
    console.error('revenuecat_fetch_failed', name);
    throw new AppError('provider_unavailable', 502);
  } finally {
    clearTimeout(timer);
  }
}

/** A quick shape-check that an App User ID is a plausible Supabase Auth UUID. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isAuthUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** SHA-256 hex fingerprint of an app user id (for safe, non-reversible audit logs). */
export async function fingerprint(appUserId: string): Promise<string> {
  const data = new TextEncoder().encode(appUserId);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
