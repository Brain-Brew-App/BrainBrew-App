import { test, expect, type Page } from '@playwright/test';
import { ROLE_MATRIX, creds } from './roles';

/**
 * Credentialed RBAC + auth/session certification (Phase 7I.2D, Parts B+C).
 *
 * Runs only where per-role test-user secrets are configured (protected preview /
 * CI). Each role skips cleanly if its ADMIN_E2E_<ROLE>_* creds are absent, so the
 * suite is safe to keep in the repo and green locally. It consumes the single
 * ROLE_MATRIX — no per-test permission assumptions.
 *
 * Provision the users first: `npm run admin-e2e:provision` (see e2e/README.md).
 */

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"], button').first().click();
  await page.waitForLoadState('networkidle');
}

for (const spec of ROLE_MATRIX) {
  test.describe(`RBAC · ${spec.role}`, () => {
    const c = creds(spec.envKey);
    test.skip(!c, `no ADMIN_E2E_${spec.envKey}_* credentials configured`);

    test('visible routes load; denied routes are refused; no stale context', async ({ page }) => {
      if (!c) return;
      await login(page, c.email, c.password);

      if (spec.fullyDenied) {
        // Player / disabled admin: the dashboard must not resolve an admin context.
        await page.goto('/');
        expect(page.url()).toMatch(/\/(login|account|denied)/);
        return;
      }
      for (const route of spec.visible) {
        await page.goto(route);
        expect(page.url(), `${spec.role} should see ${route}`).toContain(route === '/' ? '/' : route);
        expect(page.url()).not.toMatch(/\/(denied|login|account)/);
      }
      for (const route of spec.denied) {
        await page.goto(route);
        // Denied = redirected away OR a denied page (direct-URL access, not just hidden nav).
        expect(page.url(), `${spec.role} must be denied ${route}`).not.toBe(new URL(route, page.url()).href);
      }
    });
  });
}

test('account switch leaves no stale admin context', async ({ browser }) => {
  const founder = creds('FOUNDER');
  const viewer = creds('VIEWER');
  test.skip(!founder || !viewer, 'needs FOUNDER + VIEWER creds');
  if (!founder || !viewer) return;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, founder.email, founder.password);
  await page.goto('/maintenance');
  expect(page.url()).toContain('/maintenance'); // Founder sees it
  // Sign out, switch to Viewer — the Founder-only route must now deny.
  await page.goto('/account');
  await page.locator('button', { hasText: /sign out/i }).first().click().catch(() => {});
  await login(page, viewer.email, viewer.password);
  await page.goto('/maintenance');
  expect(page.url()).not.toContain('/maintenance');
  await ctx.close();
});
