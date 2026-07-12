/**
 * Canonical test-role matrix (Phase 7I.2D, Task 2). ONE source of truth consumed
 * by the credentialed Playwright specs — permission assumptions are never
 * duplicated per test. Mirrors apps/admin/lib/rbac.ts (which mirrors the DB
 * admin_can matrix; parity is asserted by db:admin-test's rbac check).
 *
 * Credentials come from ignored CI/Vercel secrets ADMIN_E2E_<ROLE>_EMAIL/PASSWORD
 * — never committed, never printed. A spec skips a role whose creds are absent.
 */

export interface RoleSpec {
  role: string;
  /** env prefix for credentials, e.g. ADMIN_E2E_FOUNDER_EMAIL / _PASSWORD */
  envKey: string;
  /** Routes that must load for this role. */
  visible: string[];
  /** Routes that must deny (redirect to /denied, /account, or /login). */
  denied: string[];
  /** True if this identity must be fully denied the Admin (player / disabled). */
  fullyDenied?: boolean;
}

export const ROLE_MATRIX: RoleSpec[] = [
  {
    role: 'founder', envKey: 'FOUNDER',
    visible: ['/', '/puzzles', '/content/authoring', '/content/authoring/queue', '/packs/authoring', '/incidents', '/incidents/void', '/maintenance', '/audit', '/reports', '/support', '/revenue'],
    denied: [],
  },
  {
    role: 'content_admin', envKey: 'CONTENT',
    visible: ['/', '/puzzles', '/content/authoring', '/content/authoring/queue', '/packs', '/packs/authoring', '/incidents'],
    denied: ['/revenue', '/maintenance'], // finance + infra not granted
  },
  {
    role: 'engineering', envKey: 'ENGINEERING',
    visible: ['/', '/health', '/maintenance', '/incidents'],
    denied: ['/content/authoring', '/revenue'],
  },
  {
    role: 'finance', envKey: 'FINANCE',
    visible: ['/', '/revenue', '/reports'],
    denied: ['/content/authoring', '/incidents/void', '/support'],
  },
  {
    role: 'support', envKey: 'SUPPORT',
    visible: ['/', '/support'],
    denied: ['/content/authoring', '/revenue', '/incidents/void'],
  },
  {
    role: 'viewer', envKey: 'VIEWER',
    visible: ['/'],
    denied: ['/content/authoring', '/packs/authoring', '/revenue', '/support', '/incidents/void'],
  },
  { role: 'player', envKey: 'PLAYER', visible: [], denied: ['/', '/content/authoring'], fullyDenied: true },
  { role: 'disabled', envKey: 'DISABLED', visible: [], denied: ['/', '/content/authoring'], fullyDenied: true },
];

export function creds(envKey: string): { email: string; password: string } | null {
  const email = process.env[`ADMIN_E2E_${envKey}_EMAIL`];
  const password = process.env[`ADMIN_E2E_${envKey}_PASSWORD`];
  return email && password ? { email, password } : null;
}
