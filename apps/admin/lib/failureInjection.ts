/**
 * Safe failure-injection adapter (Phase 7I.2D, Part I).
 *
 * Simulates operational failures for Playwright/local certification ONLY. It is
 * gated purely on BUILD/ENVIRONMENT variables — never on request input (URL,
 * query, cookie, header, or form). The production gate is absolute: when
 * VERCEL_ENV or NODE_ENV is "production" injection is OFF regardless of any flag,
 * so it can never disrupt real service.
 *
 * Pure env reads (no `server-only`) so the safety property is unit-testable in
 * Node — see scripts/failure-injection-safety-test.mjs, which mutation-tests that
 * production cannot activate it.
 */

export type FailureScenario =
  | 'auth_unavailable' | 'db_timeout' | 'builder_failure' | 'validator_timeout'
  | 'review_conflict' | 'stale_version' | 'scheduler_infeasible' | 'publication_conflict'
  | 'publication_failure' | 'void_batch_failure' | 'leaderboard_refresh_failure' | 'rollup_refresh_failure';

const isProd = (env: NodeJS.ProcessEnv): boolean =>
  env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production';

/**
 * True only in a non-production build with the explicit build flag set. Reads
 * ONLY environment variables — request data can never reach this.
 */
export function injectionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProd(env)) return false;              // absolute production gate
  return env.ADMIN_FAILURE_INJECTION === '1'; // explicit non-production opt-in
}

/** The active scenario (build-time env), or null. */
export function activeScenario(env: NodeJS.ProcessEnv = process.env): FailureScenario | null {
  if (!injectionEnabled(env)) return null;
  const s = env.ADMIN_FAILURE_SCENARIO as FailureScenario | undefined;
  return s ?? null;
}

/** Throw a simulated failure for `scenario` iff injection is enabled for it. */
export function maybeInject(scenario: FailureScenario, env: NodeJS.ProcessEnv = process.env): void {
  if (activeScenario(env) === scenario) {
    const e = new Error(`[failure-injection] simulated ${scenario}`);
    (e as Error & { injected?: boolean }).injected = true;
    throw e;
  }
}

/**
 * Load-bearing safety assertion: production must never be able to inject. Throws
 * if a production environment reports injection enabled. Called at build/startup
 * and exercised by the mutation test.
 */
export function assertProductionCannotInject(env: NodeJS.ProcessEnv = process.env): void {
  if (isProd(env) && env.ADMIN_FAILURE_INJECTION === '1' && injectionEnabled(env)) {
    throw new Error('SECURITY: failure injection is active in a production environment');
  }
}
