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

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const call = getSupabase().rpc as unknown as (
    f: string, a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  const { data, error } = await call(fn, args);
  if (error) throw new EntitlementError('network_error');
  return data;
}

export const entitlementApi = {
  /** The player's authoritative capability set. No parameters (server uses auth.uid). */
  get(): Promise<unknown> {
    return rpc('get_my_entitlements', {});
  },
};
