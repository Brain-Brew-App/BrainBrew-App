import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright — Admin certification (Phase 7I.2D). Isolated to apps/admin.
 *
 * BASE_URL points at a PROTECTED PREVIEW or local server (never the player
 * project). Credentialed per-role + lifecycle specs read test-user secrets from
 * ignored CI/Vercel env vars (ADMIN_E2E_*). The route-protection spec
 * (auth.spec.ts) needs NO credentials and runs against production/preview to
 * prove every sensitive route denies an unauthenticated request.
 *
 * Run: `npm run e2e` (install browsers once with `npx playwright install`).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.ADMIN_E2E_BASE_URL ?? 'https://admin.brainbrew.dev',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Never record secrets in traces.
    ignoreHTTPSErrors: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
