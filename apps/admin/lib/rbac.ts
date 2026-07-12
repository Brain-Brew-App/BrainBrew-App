/**
 * RBAC permission matrix (Phase 7H) — in-process, zero network.
 *
 * This is a faithful mirror of the DB `admin_can(role, capability)` function
 * (migration 20260722090000_admin_foundation.sql). It is used for UI nav filtering
 * and server-side capability checks so a page does NOT make a network round-trip
 * per capability (the 7F version issued ~15 `admin_can` RPCs per page load).
 *
 * The DB function remains the reference definition; a test asserts this mirror
 * matches it (see scripts/db/admin-test.mjs / the rbac parity check), so the two
 * cannot silently diverge.
 */

export type AdminRole =
  | 'founder' | 'super_admin' | 'product_admin' | 'content_admin'
  | 'finance' | 'support' | 'engineering' | 'viewer';

const MATRIX: Record<Exclude<AdminRole, 'founder' | 'super_admin'>, readonly string[]> = {
  product_admin: [
    'view_overview', 'view_users', 'view_growth', 'view_gameplay', 'view_categories',
    'view_engines', 'view_puzzles', 'view_packs', 'view_ranked', 'view_practice',
    'view_content', 'manage_content_notes', 'view_incidents', 'view_reports', 'export_reports',
  ],
  content_admin: [
    'view_overview', 'view_gameplay', 'view_categories', 'view_engines', 'view_puzzles',
    'view_packs', 'view_content', 'manage_content', 'review_content', 'publish_pack',
    'void_slot', 'manage_engine_meta', 'view_incidents', 'open_incident',
  ],
  finance: [
    'view_overview', 'view_revenue', 'view_subscriptions', 'view_reconciliation',
    'view_reports', 'export_reports',
  ],
  support: [
    'view_overview', 'view_users', 'lookup_user', 'moderate_user', 'resync_entitlement',
    'invalidate_result', 'view_incidents',
  ],
  engineering: [
    'view_overview', 'view_infra', 'view_health', 'run_health_check', 'set_maintenance',
    'request_restart', 'view_incidents', 'open_incident', 'resolve_incident',
    'trigger_parity', 'trigger_advisors', 'clear_cache',
  ],
  viewer: ['view_overview', 'view_investor', 'view_reports'],
};

/** Whether a role may perform a capability (matches the DB matrix). */
export function roleCan(role: AdminRole, capability: string): boolean {
  if (role === 'founder') return true;                          // founder: everything
  if (role === 'super_admin') return capability !== 'manage_founder';
  return (MATRIX[role] ?? []).includes(capability);
}

/** The full capability set for a role — resolved once per request. */
export function capabilitiesFor(role: AdminRole): ReadonlySet<string> {
  if (role === 'founder' || role === 'super_admin') return ALL_CAPS_BY_ROLE[role];
  return new Set(MATRIX[role] ?? []);
}

// Precompute founder/super_admin sets from the union of all known capabilities.
const ALL_CAPABILITIES = new Set<string>([
  'manage_founder', 'manage_admins',
  ...Object.values(MATRIX).flat(),
]);
const ALL_CAPS_BY_ROLE = {
  founder: ALL_CAPABILITIES as ReadonlySet<string>,
  super_admin: new Set([...ALL_CAPABILITIES].filter((c) => c !== 'manage_founder')) as ReadonlySet<string>,
} as const;
