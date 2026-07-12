/**
 * Entitlement client — the app side of the Phase 7D entitlement contract.
 *
 * ONE read-only, authenticated-only RPC: get_my_entitlements. It is
 * server-authoritative, auth.uid()-scoped, and takes NO user parameter (no
 * cross-user surface). The response is validated (recursive forbidden-field
 * guard + ranked-limit-1 clamp) in src/cloud/validate.ts before any screen sees
 * it. Selected only in cloud mode; local mode never calls this.
 */

import { getSupabase } from './client';

export class EntitlementError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'EntitlementError';
  }
}

declare const __DEV__: boolean | undefined;

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const client = getSupabase();
  // Call rpc AS A METHOD. Detaching it (`const call = client.rpc`) loses `this`, and
  // supabase-js then throws `Cannot read property 'rest' of undefined` — which the
  // catch below would report as a bogus "network_error".
  const call = client.rpc.bind(client) as unknown as (
    f: string, a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  const { data, error } = await call(fn, args);
  if (error) {
    // Dev-only diagnostic. The Postgres code/message identifies a broken grant or a
    // missing session; a bare "network_error" hides both. No token or payload is
    // logged, and this is stripped from release builds.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const e = error as { code?: string; message?: string; details?: string };
      console.warn(`[cloud] ${fn} failed · code=${e?.code ?? '?'} · ${e?.message ?? ''} ${e?.details ?? ''}`);
    }
    throw new EntitlementError('network_error');
  }
  return data;
}

export const entitlementApi = {
  /** The player's authoritative capability set. No parameters (server uses auth.uid). */
  get(): Promise<unknown> {
    return rpc('get_my_entitlements', {});
  },
};
