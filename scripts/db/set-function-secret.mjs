/**
 * Set the ATTEMPT_TOKEN_SECRET Edge Function secret on the linked project,
 * WITHOUT the value ever touching argv or logs (Phase 4B, Step 8).
 *
 * The value is read from the ignored env (`.env.db.local`), written to a
 * short-lived temp file that only the Supabase CLI reads via `--env-file`, and
 * the temp file is deleted immediately after. The Supabase-injected
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by the runtime and are
 * NOT set here (and must never be prefixed EXPO_PUBLIC_).
 *
 *   node scripts/db/with-secrets.mjs node scripts/db/set-function-secret.mjs
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const secret = process.env.ATTEMPT_TOKEN_SECRET;
if (!secret || /generate_a_|_here|placeholder/i.test(secret) || secret.length < 32) {
  console.error('ATTEMPT_TOKEN_SECRET is missing or a placeholder (need ≥32 real chars).');
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), 'bb-fnsec-'));
const file = join(dir, 'fn.env');
try {
  writeFileSync(file, `ATTEMPT_TOKEN_SECRET=${secret}\n`, { mode: 0o600 });
  const res = spawnSync('npx', ['--yes', 'supabase', 'secrets', 'set', '--env-file', file], {
    stdio: 'inherit', env: process.env, shell: true,
  });
  process.exitCode = res.status ?? 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('ATTEMPT_TOKEN_SECRET set (value not shown); temp file removed.');
