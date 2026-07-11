/**
 * Attempt-token contract — `npm run db:token-test`.
 *
 * Proves the HMAC token module accepts a valid token and rejects every forgery
 * and misuse it is meant to stop: tampered body, wrong secret, expiry,
 * not-yet-valid, wrong type/attempt/session/slot, and malformed input.
 *
 * Compiles the Deno `token.ts` for Node the same way the scoring contract does
 * (no `.ts` import to rewrite here — token.ts is self-contained).
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..', '..');
const outDir = mkdtempSync(join(tmpdir(), 'bb-token-'));
copyFileSync(join(ROOT, 'supabase', 'functions', '_shared', 'token.ts'), join(outDir, 'token.ts'));
const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
execFileSync(process.execPath, [
  tsc, join(outDir, 'token.ts'),
  '--ignoreConfig', '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020',
  '--lib', 'es2020,dom', '--skipLibCheck',
], { stdio: 'pipe' });
const { signToken, verifyToken, newNonce } = await import(pathToFileURL(join(outDir, 'token.js')).href);

const SECRET = 'test-secret-please-rotate-in-prod-0123456789';
const NOW = 1_800_000_000; // fixed clock for determinism (~2027)
const TTL = 600; // 10 minutes

let passed = 0;
const failures = [];
const ok = (name, cond) => (cond ? passed++ : failures.push(name));

const attemptPayload = () => ({
  typ: 'attempt', aid: 'att-1', uid: 'user-aaaa', sid: 'session-abcdef123456', pid: 'PACK_2026_07_10',
  iat: NOW, exp: NOW + TTL, nonce: newNonce(),
});
const openPayload = () => ({ ...attemptPayload(), typ: 'open', slot: 'slot-3' });

// --- happy paths ------------------------------------------------------------
{
  const t = await signToken(SECRET, attemptPayload());
  const r = await verifyToken(SECRET, t, { now: NOW + 10, typ: 'attempt', aid: 'att-1', sid: 'session-abcdef123456' });
  ok('valid attempt token verifies', r.ok && r.payload.aid === 'att-1');
}
{
  const t = await signToken(SECRET, openPayload());
  const r = await verifyToken(SECRET, t, { now: NOW + 10, typ: 'open', aid: 'att-1', slot: 'slot-3' });
  ok('valid open token verifies with matching slot', r.ok === true);
}

// --- tamper -----------------------------------------------------------------
{
  const t = await signToken(SECRET, { ...attemptPayload(), aid: 'att-1' });
  // flip a char in the body → signature no longer matches
  const [body, sig] = t.split('.');
  const forged = `${body.slice(0, -1)}${body.slice(-1) === 'A' ? 'B' : 'A'}.${sig}`;
  const r = await verifyToken(SECRET, forged, { now: NOW + 10 });
  ok('tampered body is rejected', !r.ok && r.code === 'bad_signature');
}
{
  // Re-sign an attacker-chosen payload with the WRONG secret.
  const forged = await signToken('wrong-secret', { ...attemptPayload(), aid: 'att-999' });
  const r = await verifyToken(SECRET, forged, { now: NOW + 10 });
  ok('token signed with wrong secret is rejected', !r.ok && r.code === 'bad_signature');
}

// --- expiry / clock ---------------------------------------------------------
{
  const t = await signToken(SECRET, attemptPayload());
  const r = await verifyToken(SECRET, t, { now: NOW + TTL + 1 });
  ok('expired token is rejected', !r.ok && r.code === 'expired');
}
{
  const t = await signToken(SECRET, { ...attemptPayload(), iat: NOW + 100, exp: NOW + 100 + TTL });
  const r = await verifyToken(SECRET, t, { now: NOW });
  ok('not-yet-valid token is rejected', !r.ok && r.code === 'not_yet_valid');
}

// --- binding mismatches (replay across attempts / sessions / slots) ---------
{
  const t = await signToken(SECRET, openPayload()); // slot-3
  const r = await verifyToken(SECRET, t, { now: NOW + 10, slot: 'slot-4' });
  ok('open token bound to slot-3 is rejected for slot-4', !r.ok && r.code === 'wrong_slot');
}
{
  const t = await signToken(SECRET, attemptPayload()); // att-1
  const r = await verifyToken(SECRET, t, { now: NOW + 10, aid: 'att-2' });
  ok('token for att-1 is rejected when att-2 expected', !r.ok && r.code === 'wrong_attempt');
}
{
  // Phase 5B: the token is bound to the authenticated owner (uid).
  const t = await signToken(SECRET, attemptPayload()); // uid: user-aaaa
  const r = await verifyToken(SECRET, t, { now: NOW + 10, uid: 'user-bbbb' });
  ok('a token bound to user-aaaa is rejected for user-bbbb', !r.ok && r.code === 'wrong_user');
}
{
  const t = await signToken(SECRET, attemptPayload()); // session-abcdef123456
  const r = await verifyToken(SECRET, t, { now: NOW + 10, sid: 'session-other-9999' });
  ok('token is rejected for a different session', !r.ok && r.code === 'wrong_session');
}
{
  const t = await signToken(SECRET, attemptPayload()); // typ: attempt
  const r = await verifyToken(SECRET, t, { now: NOW + 10, typ: 'open' });
  ok('attempt token is rejected where an open token is required', !r.ok && r.code === 'wrong_type');
}

// --- malformed --------------------------------------------------------------
for (const bad of ['', 'nodot', 'a.b.c', '.sig', 'body.', 'not#base64.@@@']) {
  const r = await verifyToken(SECRET, bad, { now: NOW });
  ok(`malformed token rejected: ${JSON.stringify(bad)}`, !r.ok);
}

// --- nonce uniqueness -------------------------------------------------------
{
  const a = newNonce();
  const b = newNonce();
  ok('nonces are distinct', a !== b && a.length >= 16);
}

rmSync(outDir, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} TOKEN CONTRACT FAILURE(S):\n`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} token-contract checks passed`);
