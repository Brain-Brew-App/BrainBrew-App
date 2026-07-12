/**
 * Admin auth + RBAC (Phase 7H) — SERVER ONLY, request-memoized.
 *
 * `getAdminContext()` is wrapped in React `cache()`, so the layout and the page
 * in one request share a SINGLE resolution — two network calls total (verify JWT +
 * resolve role), down from the 7F version's ~21 (it re-resolved per component and
 * issued a DB round-trip per capability). Capabilities are computed in-process
 * from the role via the DB-mirrored matrix (see rbac.ts), so capability checks are
 * free. Enforcement is still server-side; a disabled admin is rejected because the
 * role comes from `admin_role_of` (active-only) every request.
 */

import { cache } from 'react';
import { redirect } from 'next/navigation';

import { adminClient, sessionClient } from './supabase';
import { capabilitiesFor, roleCan, type AdminRole } from './rbac';

export type { AdminRole };

export interface AdminContext {
  userId: string;
  email: string | null;
  role: AdminRole;
  capabilities: ReadonlySet<string>;
}

/**
 * The verified admin context, or null. Memoized per request via React cache():
 * the JWT is validated once and the role resolved once, no matter how many
 * components ask. A fresh request always re-validates (role changes take effect
 * on the next navigation).
 */
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const supa = await sessionClient();
  const { data: { user } } = await supa.auth.getUser(); // validates the JWT (1 network call)
  if (!user) return null;

  const { data, error } = await adminClient().rpc('admin_role_of', { p_user: user.id }); // active-only (1 call)
  if (error || !data) return null;

  const role = data as AdminRole;
  return { userId: user.id, email: user.email ?? null, role, capabilities: capabilitiesFor(role) };
});

/** Require an active admin; redirect to /login otherwise. */
export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/login');
  return ctx;
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
