/**
 * Supabase client-binding regression test — `npm run test:supabase-binding`.
 *
 * A real on-device bug this catches: several clients did
 *
 *     const call = getSupabase().rpc;      // ← detached from the client
 *     await call('get_my_entitlements', {});
 *
 * `rpc` / `functions.invoke` are PROTOTYPE methods in supabase-js, so calling them
 * detached loses `this` and throws `Cannot read property 'rest' of undefined`. Every
 * caller then reported a bogus "network_error" — the Premium screen showed "We
 * couldn't reach the server" while the network and server were perfectly healthy.
 *
 * This test fakes a supabase-js-shaped client whose methods REQUIRE `this` (exactly
 * like the real one) and asserts every client module can still call through.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
let passed = 0; const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));

// ── 1. Reproduce the failure mode against a supabase-js-shaped client ────────
class FakeSupabaseClient {
  constructor() { this.rest = { url: 'https://example.test' }; }
  // Mirrors supabase-js: a prototype method that dereferences `this`.
  rpc(fn, args) {
    if (!this || !this.rest) throw new TypeError("Cannot read property 'rest' of undefined");
    return Promise.resolve({ data: { fn, args }, error: null });
  }
}

{
  const client = new FakeSupabaseClient();

  // The BUG: detaching the method.
  let threw = null;
  try { const detached = client.rpc; await detached('get_my_entitlements', {}); } catch (e) { threw = e; }
  ok('detached .rpc throws the exact TypeError seen on device',
    threw instanceof TypeError && /Cannot read property 'rest' of undefined/.test(threw.message));

  // The FIX: bind, or call as a method.
  const bound = client.rpc.bind(client);
  const r = await bound('get_my_entitlements', {});
  ok('bound .rpc reaches the server', r.error === null && r.data.fn === 'get_my_entitlements');
  const m = await client.rpc('get_my_entitlements', {});
  ok('method-call .rpc reaches the server', m.error === null);
}

// ── 2. No client module may detach rpc / functions.invoke ever again ─────────
// Static guard: the pattern `= getSupabase().rpc` (without .bind) is the bug.
const SRC_DIRS = ['src/infrastructure/supabase', 'src/cloud', 'src/cloud/analytics', 'src/cloud/revenuecat'];
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) walk(`${dir}/${e.name}`);
    else if (/\.tsx?$/.test(e.name)) files.push(`${dir}/${e.name}`);
  }
};
for (const d of ['src']) walk(d);

const offenders = [];
for (const f of files) {
  const lines = readFileSync(resolve(ROOT, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    // The bug signature: ASSIGNING `.rpc` / `.invoke` (rather than CALLING it) with
    // no `.bind(` on the same line. `const { data } = await client.rpc(...)` is a
    // call, not an assignment of the method, so it is fine.
    const assignsMethod = /=\s*[A-Za-z0-9_.()]*\.(rpc|invoke)\s*(as\b|;|$)/.test(line);
    if (assignsMethod && !line.includes('.bind(')) offenders.push(`${f}:${i + 1} → ${line.trim().slice(0, 70)}`);
  });
}
ok(`no client detaches rpc/invoke from its owner (${files.length} files scanned)`, offenders.length === 0);
for (const o of offenders) failures.push(`DETACHED METHOD: ${o}`);

// ── 3. The known-good sites are actually bound ──────────────────────────────
for (const f of [
  'src/infrastructure/supabase/entitlementClient.ts',
  'src/infrastructure/supabase/leaderboardClient.ts',
  'src/infrastructure/supabase/progressClient.ts',
  'src/infrastructure/supabase/gameplayClient.ts',
  'src/cloud/analytics/index.ts',
]) {
  const src = readFileSync(resolve(ROOT, f), 'utf8');
  ok(`${f.split('/').pop()} binds its supabase handle`, /\.bind\(/.test(src));
}

for (const f of failures) console.error(`  ✕ ${f}`);
if (failures.length) { console.error(`\n✕ supabase-binding: ${failures.length} failed, ${passed} passed.`); process.exit(1); }
console.log(`✓ supabase-binding: ${passed} checks passed (detached rpc/invoke reproduces the device TypeError; no module detaches one).`);
