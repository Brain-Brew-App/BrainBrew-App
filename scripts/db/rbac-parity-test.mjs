/**
 * RBAC parity test — `npm run db:rbac-parity-test`.
 *
 * Phase 7H moved the capability matrix into TS (apps/admin/lib/rbac.ts) so the
 * admin dashboard resolves permissions in-process (no per-capability DB round
 * trip). This proves the TS mirror is IDENTICAL to the authoritative DB
 * `admin_can(role, capability)` for every role × capability — so the perf change
 * never weakens or diverges from the security matrix.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { freshDb, actAs } from './pglite-harness.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const out = mkdtempSync(join(tmpdir(), 'rbac-'));
const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
try {
  execFileSync(process.execPath, [
    tsc, join(ROOT, 'apps', 'admin', 'lib', 'rbac.ts'),
    '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck',
  ], { cwd: ROOT, stdio: 'pipe' });
} catch (e) { const m = `${e.stdout ?? ''}${e.stderr ?? ''}`; if (m && !/TS5107/.test(m)) { console.error(m); process.exit(1); } }
const { roleCan } = await import(pathToFileURL(join(out, 'rbac.js')).href);

const db = await freshDb();
await actAs(db, null);
const q = async (sql, p = []) => (await db.query(sql, p)).rows;

const ROLES = ['founder', 'super_admin', 'product_admin', 'content_admin', 'finance', 'support', 'engineering', 'viewer'];
const CAPS = [
  'view_overview', 'view_users', 'view_growth', 'view_gameplay', 'view_categories', 'view_engines',
  'view_puzzles', 'view_packs', 'view_ranked', 'view_practice', 'view_content', 'manage_content_notes',
  'view_incidents', 'view_reports', 'export_reports', 'manage_content', 'review_content', 'publish_pack',
  'void_slot', 'manage_engine_meta', 'open_incident', 'view_revenue', 'view_subscriptions',
  'view_reconciliation', 'lookup_user', 'moderate_user', 'resync_entitlement', 'invalidate_result',
  'view_infra', 'view_health', 'run_health_check', 'set_maintenance', 'request_restart', 'resolve_incident',
  'trigger_parity', 'trigger_advisors', 'clear_cache', 'view_investor', 'manage_admins', 'manage_founder',
  'some_unknown_capability',
];

let passed = 0; const failures = [];
for (const role of ROLES) {
  for (const cap of CAPS) {
    const dbVal = (await q(`select admin_can($1::admin_role, $2) c`, [role, cap]))[0].c === true;
    const tsVal = roleCan(role, cap) === true;
    if (dbVal === tsVal) passed++;
    else failures.push(`MISMATCH ${role}/${cap}: db=${dbVal} ts=${tsVal}`);
  }
}
rmSync(out, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} RBAC PARITY MISMATCH(ES):`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ RBAC parity: TS matrix matches DB admin_can across all ${ROLES.length}×${CAPS.length} = ${passed} role/capability checks`);
