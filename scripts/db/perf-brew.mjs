/**
 * Gameplay latency benchmark — `npm run perf:brew`.
 *
 * Times every server call in a full brew, from a real client, against the live
 * backend. Uses PRACTICE so no ranked attempt is ever consumed.
 *
 * The point is to find out where the wait actually goes before optimising anything:
 * network distance, Edge Function cold start, the auth round trip inside each
 * function, or the DB queries. "It feels slow" is not a diagnosis.
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const sb = createClient(URL, ANON, { auth: { persistSession: false } });

const timings = [];
async function timed(label, fn) {
  const t0 = performance.now();
  const out = await fn();
  const ms = Math.round(performance.now() - t0);
  timings.push([label, ms]);
  console.log(`  ${String(ms).padStart(5)} ms  ${label}`);
  return out;
}

const { data: auth, error: authErr } = await sb.auth.signInAnonymously();
if (authErr) { console.error('anon sign-in failed:', authErr.message); process.exit(1); }
const token = auth.session.access_token;
const uid = auth.user.id;

const call = async (fn, body) => {
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${fn} → ${res.status} ${JSON.stringify(json)}`);
  return json;
};

console.log(`\nLatency of a full PRACTICE brew (project region: ap-southeast-1 / Singapore)\n`);

// A profile is required before gameplay.
await sb.rpc('set_username', { p_username: 'perf' + Math.random().toString(36).slice(2, 8) });
await sb.rpc('set_country', { p_country: 'AE', p_display: 'United Arab Emirates' });

const sessionId = 'perf-bench-' + Date.now();
const start = await timed('start-practice-attempt', () => call('start-practice-attempt', { sessionId, appVersion: '1.0.0' }));
const token2 = start.attemptToken;

for (let pos = 1; pos <= 5; pos++) {
  await timed(`open-puzzle  slot ${pos}`, () => call('open-puzzle', { attemptToken: token2, sessionId, position: pos }));
  await timed(`submit-answer slot ${pos}`, () => call('submit-answer', {
    attemptToken: token2, sessionId, position: pos, answer: { kind: 'choice', optionId: 'x' },
  }).catch(() => ({})));   // a wrong/invalid answer still exercises the full path
}

await timed('complete-attempt', () => call('complete-attempt', { attemptToken: token2, sessionId }));

// What the Results screen fetches immediately AFTER completion.
await timed('get_my_progress_summary (Results)', () => sb.rpc('get_my_progress_summary'));

const total = timings.reduce((s, [, ms]) => s + ms, 0);
const complete = timings.find(([l]) => l === 'complete-attempt')?.[1] ?? 0;
console.log(`\n  TOTAL round trips: ${timings.length}   TOTAL time: ${(total / 1000).toFixed(1)}s`);
console.log(`  complete-attempt alone: ${complete} ms  ← the wait after the last puzzle`);

// Clean up the throwaway user.
const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
await admin.from('attempts').delete().eq('user_id', uid);
await admin.from('profiles').delete().eq('id', uid);
await admin.auth.admin.deleteUser(uid).catch(() => {});
console.log('  (benchmark user removed)');
