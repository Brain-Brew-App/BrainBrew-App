/**
 * Admin auth + RBAC (Phase 7H.1) — SERVER ONLY, request-memoized.
 *
 * `getAdminSession()` (React `cache()`) resolves the full session ONCE per request
 * — layout + page + actions share it (2 network calls: verify JWT + resolve role).
 * It distinguishes THREE states so we never bounce-loop:
 *   • not authenticated → /login
 *   • authenticated but NOT an active admin → /account (mismatch, offer switch)
 *   • active admin → proceed
 * Capabilities are computed in-process from the DB-mirrored matrix (rbac.ts).
 */

import { cache } from 'react';
import { redirect } from 'next/navigation';

import { adminClient, sessionClient } from './supabase';
import { capabilitiesFor, roleCan, type AdminRole } from './rbac';

export type { AdminRole };

export interface AdminSession {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  role: AdminRole | null;
  capabilities: ReadonlySet<string>;
}

export interface AdminContext {
  userId: string;
  email: string | null;
  role: AdminRole;
  capabilities: ReadonlySet<string>;
}

const EMPTY: ReadonlySet<string> = new Set();

/** The full session, memoized per request. */
export const getAdminSession = cache(async (): Promise<AdminSession> => {
  const supa = await sessionClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { authenticated: false, userId: null, email: null, role: null, capabilities: EMPTY };

  const { data, error } = await adminClient().rpc('admin_role_of', { p_user: user.id });
  const role = !error && data ? (data as AdminRole) : null; // active admins only
  return {
    authenticated: true,
    userId: user.id,
    email: user.email ?? null,
    role,
    capabilities: role ? capabilitiesFor(role) : EMPTY,
  };
});

/** The verified admin context, or null (not signed in OR not an active admin). */
export async function getAdminContext(): Promise<AdminContext | null> {
  const s = await getAdminSession();
  return s.role ? { userId: s.userId!, email: s.email, role: s.role, capabilities: s.capabilities } : null;
}

/** Require an active admin; redirect to /login (anon) or /account (mismatch). */
export async function requireAdmin(): Promise<AdminContext> {
  const s = await getAdminSession();
  if (!s.authenticated) redirect('/login');
  if (!s.role) redirect('/account'); // signed in, but this account isn't an admin
  return { userId: s.userId!, email: s.email, role: s.role, capabilities: s.capabilities };
}

/** Capability check — in-process, no network (matches the DB matrix). */
export function can(role: AdminRole, capability: string): boolean {
  return roleCan(role, capability);
}

/** Require a capability; redirect to /denied otherwise. */
export async function requireCapability(capability: string): Promise<AdminContext> {
  const ctx = await requireAdmin();
  if (!ctx.capabilities.has(capability) && !roleCan(ctx.role, capability)) redirect('/denied');
  return ctx;
}

/** Conditional-UI capability check for a known context. */
export function contextCan(ctx: AdminContext, capability: string): boolean {
  return ctx.capabilities.has(capability) || roleCan(ctx.role, capability);
}

/**
 * Recent-authentication check for high-impact actions (Phase 7H.1). Verifies the
 * session's last sign-in is within `maxAgeSec`. Returns false if unknown/stale;
 * the caller then requires a password reauth. (Belt-and-suspenders on top of the
 * per-action password reauth already used for maintenance.)
 */
export async function hasRecentAuth(maxAgeSec = 900): Promise<boolean> {
  const supa = await sessionClient();
  const { data: { user } } = await supa.auth.getUser();
  const lastSignIn = user?.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN;
  return Number.isFinite(lastSignIn) && (Date.now() - lastSignIn) / 1000 <= maxAgeSec;
}
