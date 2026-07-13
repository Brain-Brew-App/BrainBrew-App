/**
 * B5 setup — `node scripts/db/rc1-complete-elsewhere.mjs <uid-prefix>`.
 *
 * Reproduces "the player already completed today's ranked brew on ANOTHER device".
 *
 * It writes the exact server condition that a real second device would have left
 * behind: a completed, scored ranked attempt for today. The ranked-eligibility RPC
 * then reports `ranked_attempt_completed`, which is what `start-attempt` turns into
 * the `alreadyCompleted` response the client must handle.
 *
 * This is the state that used to hang the app forever on "Brewing today's puzzles…"
 * with no button — the client dispatched PACK_LOADED from 'idle', the reducer
 * swallowed the illegal transition, and only a force-quit escaped.
 *
 * Service-role write, used only to stage the test. The CLIENT behaviour under test
 * is not simulated in any way.
 */

import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const prefix = process.argv[2];
if (!prefix) { console.error('usage: rc1-complete-elsewhere.mjs <uid-prefix>'); process.exit(1); }

const { data: profiles } = await db.from('profiles').select('id,username,account_type');
const target = (profiles ?? []).find((p) => p.id.startsWith(prefix));
if (!target) { console.error(`no profile starting with ${prefix}`); process.exit(1); }
if (target.account_type !== 'permanent') {
  console.error(`${prefix} is ${target.account_type} — ranked needs a permanent account`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const { data: pack } = await db
  .from('daily_packs').select('pack_id').eq('pack_date', today).eq('status', 'live').maybeSingle();
if (!pack) { console.error(`no live pack for ${today}`); process.exit(1); }

const { data: existing } = await db
  .from('attempts').select('id,status').eq('user_id', target.id).eq('is_ranked', true).eq('pack_id', pack.pack_id);
if ((existing ?? []).some((a) => a.status === 'completed')) {
  console.log('already has a completed ranked attempt today — nothing to stage');
  process.exit(0);
}

// A ranked attempt must carry its owner, ranked date and country snapshot
// (constraint `ranked_requires_fields`) — the same fields the real flow writes.
const { data: prof } = await db.from('profiles').select('country_code').eq('id', target.id).single();

const now = new Date().toISOString();
const { data: ins, error } = await db
  .from('attempts')
  .insert({
    user_id: target.id,
    session_id: 'rc1a-elsewhere-device-b',   // >= 16 chars (constraint session_present)
    pack_id: pack.pack_id,
    is_ranked: true,
    ranked_date: today,
    country_code_snapshot: prof?.country_code ?? 'AE',
    status: 'completed',
    final_score: 61,
    active_denominator: 100,
    started_at: now,
    completed_at: now,
  })
  .select('id')
  .single();

if (error) { console.error('stage failed:', error.message); process.exit(1); }

console.log(`staged: ${target.username} now has a COMPLETED ranked attempt for ${today} (score 61)`);
console.log(`  attempt ${ins.id.slice(0, 8)}…`);
console.log('  the device still has a STALE Home showing the ranked CTA — tap it.');
console.log('  expected: the completed state appears. Failure mode: infinite spinner, no button.');
