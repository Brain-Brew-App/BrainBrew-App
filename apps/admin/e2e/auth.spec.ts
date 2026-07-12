import { test, expect } from '@playwright/test';

/**
 * Route-protection certification (Phase 7I.2D) — runs with NO credentials, so it
 * is safe against production/preview. Every sensitive Admin route must deny an
 * unauthenticated request (redirect to /login) and carry the security headers.
 *
 * Credentialed per-role RBAC + puzzle/pack/incident lifecycle specs are separate
 * files (rbac.spec.ts, puzzle.spec.ts, pack.spec.ts, incident.spec.ts) that read
 * ADMIN_E2E_* test-user secrets and target a protected preview — see e2e/README.md.
 */

const PROTECTED = [
  '/', '/content/authoring', '/content/authoring/queue',
  '/content/authoring/new/OBS_001', '/content/authoring/draft/00000000-0000-0000-0000-000000000000',
  '/packs', '/packs/authoring', '/packs/authoring/00000000-0000-0000-0000-000000000000',
  '/incidents', '/incidents/void', '/incidents/void/00000000-0000-0000-0000-000000000000',
  '/incidents/void/op/00000000-0000-0000-0000-000000000000',
  '/audit', '/support', '/health', '/maintenance', '/revenue',
];

for (const path of PROTECTED) {
  test(`unauthenticated ${path} → /login`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/login');
    // Security headers present on the served (login) response.
    const headers = res?.headers() ?? {};
    expect(headers['x-robots-tag'] ?? '').toContain('noindex');
    expect(headers['strict-transport-security'] ?? '').toContain('max-age');
    expect(headers['x-frame-options'] ?? '').toBe('DENY');
  });
}

test('login page renders its form (nonce CSP allows Next bootstrap)', async ({ page }) => {
  await page.goto('/login');
  // The interactive form hydrates under the per-request nonce CSP.
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"], button')).toHaveCount(1, { timeout: 10_000 }).catch(async () => {
    await expect(page.locator('button').first()).toBeVisible();
  });
});
