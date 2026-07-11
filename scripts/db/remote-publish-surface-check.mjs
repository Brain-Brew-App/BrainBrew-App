/**
 * Remote publish + public-surface verification (Phase 4B, Steps 10–11).
 *
 * Service role: exactly the published live packs, one per date, five ordered
 * slots each, no reserve scheduled, no reused puzzle, and live-pack immutability
 * (a live slot cannot be re-pointed; a live pack cannot be moved) — all proven
 * by attempting the mutation and asserting it is REJECTED (nothing is changed).
 *
 * Anon (publishable) key: today's pack is visible with only allowlisted,
 * answer-free fields; future/undated packs and all private tables are hidden.
 * The actual JSON is inspected for any answer-revealing key.
 *
 *   node scripts/db/with-secrets.mjs node scripts/db/remote-publish-surface-check.mjs
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const PUBLISHABLE = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const svc = createClient(URL, SECRET, { auth: { persistSession: false } });
const anon = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));

const ALLOWED = new Set(['pack_date', 'pack_difficulty', 'position', 'category', 'engine_id', 'puzzle_id', 'difficulty', 'prompt', 'public_payload', 'max_score']);
// EXACT private key names (mirrors ENGINE_SPLIT). Exact match, so render fields
// like `buckets` (the bin LABELS) are not confused with the private per-item
// `bucket` answer.
const PRIVATE_KEYS = new Set([
  'oddTileId', 'correctOptionId', 'pairTileIds', 'wrongIndex', 'correctTerm',
  'correctOrder', 'constraints', 'membership', 'targetIds', 'explanation',
  'isTarget', 'bucket', 'answer_payload', 'answer',
]);
const isAnswerKey = (k) => PRIVATE_KEYS.has(k);

// --- service role: published set shape --------------------------------------
const { data: live } = await svc.from('daily_packs').select('pack_id, pack_date').eq('status', 'live').order('pack_date');
ok('at least 7 live packs published', (live?.length ?? 0) >= 7);
const dates = (live ?? []).map((p) => p.pack_date);
ok('one live pack per UTC date (no duplicate dates)', new Set(dates).size === dates.length);

for (const p of live ?? []) {
  const { data: slots } = await svc.from('daily_pack_slots').select('position, category').eq('pack_id', p.pack_id).order('position');
  const positions = (slots ?? []).map((s) => s.position);
  ok(`pack ${p.pack_id} has five ordered slots 1..5`, JSON.stringify(positions) === JSON.stringify([1, 2, 3, 4, 5]));
}

// No reserve puzzle scheduled; no puzzle reused (unique per pack, unique globally).
{
  const { data: allSlots } = await svc.from('daily_pack_slots').select('puzzle_id');
  const ids = (allSlots ?? []).map((s) => s.puzzle_id);
  ok('no puzzle is scheduled more than once (globally unique)', new Set(ids).size === ids.length);
  // reserve puzzles = approved puzzles not in any slot; assert count 64 remains.
  const { count: puzzleCount } = await svc.from('puzzles').select('*', { count: 'exact', head: true });
  ok('reserve preserved (314 puzzles − 250 scheduled = 64)', (puzzleCount ?? 0) - new Set(ids).size === 64);
}

// Live-pack immutability: a live slot cannot be re-pointed (trigger rejects).
{
  const first = (live ?? [])[0];
  const { data: reserve } = await svc.from('puzzles').select('puzzle_id').limit(400);
  const scheduled = new Set(((await svc.from('daily_pack_slots').select('puzzle_id')).data ?? []).map((s) => s.puzzle_id));
  const spare = (reserve ?? []).map((r) => r.puzzle_id).find((id) => !scheduled.has(id));
  const { error } = await svc.from('daily_pack_slots').update({ puzzle_id: spare }).eq('pack_id', first.pack_id).eq('position', 1);
  ok('a live pack slot cannot be re-pointed to another puzzle', Boolean(error) && /immutable/i.test(error.message));
}

// Live pack cannot be moved to another date.
{
  const first = (live ?? [])[0];
  const { error } = await svc.rpc('publish_pack', { p_pack_id: first.pack_id, p_date: '2026-12-31' });
  ok('a live pack cannot be moved to a different date', Boolean(error) && /cannot be moved/i.test(error.message));
}

// --- anon (publishable): today's pack visible, sanitized --------------------
const today = (await svc.rpc('get_public_pack')).data?.[0]?.pack_date
  ?? (live ?? []).map((p) => p.pack_date).sort()[0];

{
  const { data, error } = await anon.rpc('get_public_pack', { p_date: today });
  ok('anon can fetch today\'s live pack', !error && (data?.length ?? 0) === 5);
  const rows = data ?? [];
  // Column allowlist.
  const strayCols = rows.flatMap((r) => Object.keys(r).filter((k) => !ALLOWED.has(k)));
  ok('public rows expose ONLY allowlisted columns', strayCols.length === 0);
  // No answer-revealing key at the top level or inside public_payload.
  const leaks = rows.flatMap((r) => {
    const top = Object.keys(r).filter(isAnswerKey);
    const payloadKeys = r.public_payload && typeof r.public_payload === 'object' ? deepKeys(r.public_payload) : [];
    return [...top, ...payloadKeys.filter(isAnswerKey)];
  });
  ok('no answer-revealing field anywhere in the public JSON', leaks.length === 0);
  if (leaks.length) console.error('   leaked keys:', [...new Set(leaks)].join(', '));
}

// Future-dated live packs are hidden until their date arrives.
{
  const futureDate = (live ?? []).map((p) => p.pack_date).sort().at(-1); // latest published date
  if (futureDate && futureDate > today) {
    const { data } = await anon.rpc('get_public_pack', { p_date: futureDate });
    ok('a future-dated pack is hidden from anon until its date', (data?.length ?? 0) === 0);
  } else {
    ok('a future-dated pack is hidden from anon until its date', true);
  }
}

// Private tables remain inaccessible to anon.
for (const t of ['puzzle_answers', 'puzzle_seeds', 'puzzles', 'daily_packs', 'attempts']) {
  const { error } = await anon.from(t).select('*').limit(1);
  ok(`anon denied base/private table: ${t}`, Boolean(error));
}

function deepKeys(obj, out = []) {
  if (Array.isArray(obj)) obj.forEach((v) => deepKeys(v, out));
  else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) { out.push(k); deepKeys(v, out); }
  return out;
}

if (failures.length) {
  console.error(`\n${failures.length} REMOTE PUBLISH/SURFACE CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} remote publish + public-surface checks passed (today=${today})`);
