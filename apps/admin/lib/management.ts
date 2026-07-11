/**
 * Supabase Management API adapter (Phase 7G) — SERVER ONLY, behind an interface.
 *
 * The live project-restart operation is DELIBERATELY DISABLED this phase: it is
 * not certified for production. This module defines the interface and a mock so
 * the UI + tests exercise the guardrails (reauth, typed confirmation, maintenance-
 * first, audit) WITHOUT any real Management API call. The real adapter is wired
 * only after a Founder-approved operational certification (see
 * docs/ADMIN_DEPLOYMENT_CERTIFICATION.md). No Management token is required for
 * Phase 7G completion.
 */

export interface ManagementAdapter {
  /** Whether a live restart is currently permitted (env-gated + certified). */
  restartEnabled(): boolean;
  restartProject(projectRef: string): Promise<{ status: 'started' | 'disabled'; operationId?: string }>;
}

/** The active adapter — disabled by default. A real adapter is a later, gated change. */
export function managementAdapter(): ManagementAdapter {
  const certified = process.env.ADMIN_RESTART_CERTIFIED === 'true' && Boolean(process.env.SUPABASE_MANAGEMENT_ACCESS_TOKEN);
  return {
    restartEnabled: () => certified, // false unless explicitly certified + token present
    async restartProject() {
      // Intentionally a no-op until certification. NEVER calls the Management API here.
      return { status: 'disabled' };
    },
  };
}
