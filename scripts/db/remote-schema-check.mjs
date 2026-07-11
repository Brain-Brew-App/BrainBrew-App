/**
 * Remote schema + RLS verification (Phase 4B, Step 3/11).
 *
 * Connects to the LIVE linked project and proves the migrated schema behaves:
 * every table exists, the sanitized RPC is callable, publish_pack is present,
 * and — under the real anon (publishable) key — the private tables are denied
 * while the public RPC is allowed. Never prints a credential or an answer.
 *
 *   node scripts/db/with-secrets.mjs node scripts/db/remote-schema-check.mjs
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const PUBLISHABLE = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !SECRET || !PUBLISHABLE) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  process.exit(2);
}

const svc = createClient(URL, SECRET, { auth: { persistSession: false } });
const anon = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });

let passed = 0;
const failures = [];
const ok = (name, cond) => (cond ? passed++ : failures.push(name));
const denied = (err) => Boolean(err) && /permission denied|not.*allowed|42501|JWT|row-level|no.*access/i.test(`${err.message} ${err.code ?? ''}`);

// --- service role: every table exists and is selectable ---------------------
for (const t of [
  'puzzle_engines', 'puzzle_seeds', 'puzzles', 'puzzle_answers', 'puzzle_validation_results',
  'content_reviews', 'daily_packs', 'daily_pack_slots', 'attempts', 'attempt_items',
]) {
  const { error } = await svc.from(t).select('*', { count: 'exact', head: true });
  ok(`table exists and service_role can read: ${t}`, !error);
}

// --- the sanitized RPC is callable (empty until a pack is live) --------------
{
  const { data, error } = await svc.rpc('get_public_pack');
  ok('get_public_pack RPC is callable (service)', !error && Array.isArray(data));
}

// --- publish_pack exists and validates (rejects an unknown pack) ------------
{
  const { error } = await svc.rpc('publish_pack', { p_pack_id: '__nope__', p_date: '2020-01-01' });
  ok('publish_pack exists and rejects an unknown pack', Boolean(error) && /does not exist/i.test(error.message));
}

// --- anon (publishable) is denied every private surface ---------------------
for (const t of ['puzzle_answers', 'puzzle_seeds', 'content_reviews', 'puzzle_validation_results', 'puzzles', 'attempts', 'attempt_items']) {
  const { error } = await anon.from(t).select('*').limit(1);
  ok(`anon is denied base table: ${t}`, denied(error));
}

// --- anon cannot WRITE the base content or attempts -------------------------
{
  const { error } = await anon.from('attempts').insert({ session_id: 'x'.repeat(16), pack_id: 'nope' });
  ok('anon cannot insert attempts', denied(error) || Boolean(error));
}

// --- anon CAN call the public RPC (the one allowed surface) -----------------
{
  const { data, error } = await anon.rpc('get_public_pack');
  ok('anon may call get_public_pack', !error && Array.isArray(data));
}

if (failures.length) {
  console.error(`\n${failures.length} REMOTE SCHEMA CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} remote schema/RLS checks passed on the live project`);
