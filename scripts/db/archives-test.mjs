/**
 * Premium Archives tests — `npm run db:archives-test`.
 *
 * Proves the Phase 7J Archives backend: entitlement is enforced server-side
 * (free/beta locked, premium unlocked), calendar/pack reads are sanitized (no
 * answers, past-only), archive attempts are UNRANKED and fully isolated from every
 * ranked surface, resume works, and the ranked fairness invariant (limit 1) holds
 * in every state. Includes the mutation tests from Part N/R.
 */

import { createHash } from 'node:crypto';
import { freshDb, actAs } from './pglite-harness.mjs';

const hh = (s) => createHash('sha256').update(s).digest('hex');
const db = await freshDb();
await db.exec(`set time zone 'UTC';`);
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = (r) => (r.length ? r[0] : null);
let passed = 0; const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
async function expectFail(name, fn, m) { try { await fn(); failures.push(`${name} — expected rejection`); } catch (e) { if (m && !new RegExp(m, 'i').test(e.message)) failures.push(`${name} — ${e.message.split('\n')[0]}`); else passed++; } }

const PREMIUM = '11111111-1111-1111-1111-111111111111';
const FREE = '22222222-2222-2222-2222-222222222222';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false),($2,false)`, [PREMIUM, FREE]);
await db.query(`insert into countries (code, name) values ('US','United States') on conflict do nothing`);
await db.query(`insert into profiles (id, account_type, country_code) values ($1,'permanent','US'),($2,'permanent','US')
  on conflict (id) do update set account_type='permanent', country_code='US'`, [PREMIUM, FREE]);
await db.query(`insert into player_entitlements (user_id, entitlement_state, is_active) values ($1,'premium',true)`, [PREMIUM]);
// Ensure beta_open policy (free → beta → not premium → archives locked).
await db.query(`update release_policy set mode='beta_open' where id`);

// A past live daily pack (yesterday) with five approved-puzzle slots.
const CATS = [['observation', 'OBS_091'], ['pattern', 'PAT_091'], ['logic', 'LOG_091'], ['language-logic', 'LNG_091'], ['attention-speed', 'ATT_091']];
for (const [cat, eng] of CATS) {
  await db.query(`insert into puzzle_engines (engine_id, category, name, active, build_status, min_difficulty, max_difficulty, weekly_cap, min_days_between, estimated_time_ms, ui_component, builder_id, validator_id, scoring_id, explanation_strategy) values ($1,$2,$3,true,'built',1,5,7,1,8000,'C',$1,$1,'score','static')`, [eng, cat, eng]);
  await db.query(`insert into puzzle_seeds (seed_id, engine_id, payload, authored_difficulty, source_type, content_hash) values ($1,$2,'{}'::jsonb,3,'human',$3)`, [`s-${eng}`, eng, hh('seed' + eng)]);
  const pid = `pz-${eng}`;
  await db.query(`insert into puzzles (puzzle_id, engine_id, seed_id, category, difficulty, prompt, public_payload, builder_version, validator_version, content_hash, status) values ($1,$2,$3,$4,3,'p',$5::jsonb,'b','v',$6,'draft')`, [pid, eng, `s-${eng}`, cat, JSON.stringify({ prompt: 'q', tiles: [{ id: 't0', glyph: '△' }] }), hh(pid)]);
  await db.query(`insert into puzzle_validation_results (puzzle_id, validator_version, passed, findings, validation_hash, validation_source) values ($1,'v',true,'[]'::jsonb,$2,'test')`, [pid, hh(pid + 'v')]);
  await db.query(`insert into puzzle_answers (puzzle_id, answer_payload, explanation) values ($1,'{"oddTileId":"t0"}'::jsonb,'x')`, [pid]);
  await db.query(`update puzzles set status='approved', approved_at=now() where puzzle_id=$1`, [pid]);
}
const PACK = 'pk-arch-1';
await db.query(`insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label) values ($1,900,'draft',$2,'standard')`, [PACK, hh('pk')]);
const posOf = { observation: 1, pattern: 2, logic: 3, 'language-logic': 4, 'attention-speed': 5 };
for (const [cat, eng] of CATS) await db.query(`insert into daily_pack_slots (pack_id, position, category, puzzle_id, engine_id) values ($1,$2,$3,$4,$5)`, [PACK, posOf[cat], cat, `pz-${eng}`, eng]);
await db.query(`update daily_packs set status='approved' where pack_id=$1`, [PACK]);
await db.query(`update daily_packs set status='live', pack_date=current_date - 1, published_at=now() where pack_id=$1`, [PACK]);

// =============================================================================
// 1. Entitlement capability (server-side) + fairness invariant
// =============================================================================
await actAs(db, PREMIUM, { isAnonymous: false });
{
  const e = one(await q(`select get_my_entitlements() r`)).r;
  ok('premium: archives capability = true', e.capabilities.archives === true);
  ok('premium: ranked limit is a hard 1', e.limits.ranked_attempts_per_utc_day === 1);
}
await actAs(db, FREE, { isAnonymous: false });
{
  const e = one(await q(`select get_my_entitlements() r`)).r;
  ok('free/beta: archives capability = false', e.capabilities.archives === false);
  ok('free/beta: ranked limit is a hard 1', e.limits.ranked_attempts_per_utc_day === 1);
}

// =============================================================================
// 2. Calendar + pack reads (sanitized, entitlement-gated, past-only)
// =============================================================================
await actAs(db, FREE, { isAnonymous: false });
ok('free: calendar locked', one(await q(`select get_archive_calendar(30,0) r`)).r.locked === true);
await expectFail('free: get_archive_pack denied', () => q(`select get_archive_pack((current_date - 1))`), 'archive_locked');

await actAs(db, PREMIUM, { isAnonymous: false });
{
  const cal = one(await q(`select get_archive_calendar(30,0) r`)).r;
  ok('premium: calendar unlocked + lists the past date, not today', cal.locked === false && cal.dates.length === 1);
  const pack = one(await q(`select get_archive_pack((current_date - 1)) r`)).r;
  ok('premium: pack returns 5 sanitized slots', Array.isArray(pack.slots) && pack.slots.length === 5);
  ok('premium: pack public_payload present, NO answer key', pack.slots[0].public_payload && !JSON.stringify(pack).includes('oddTileId'));
}
await expectFail('premium: today is not archivable', () => q(`select get_archive_pack(current_date)`), 'not_a_past_date');
await expectFail('premium: unknown date unavailable', () => q(`select get_archive_pack((current_date - 5))`), 'archive_pack_unavailable');

// =============================================================================
// 3. Start archive attempt (service role) — unranked + isolated + resume
// =============================================================================
await actAs(db, null);
const start = one(await q(`select start_archive_attempt($1,(current_date - 1),'sess-arch-000000000',null) r`, [PREMIUM])).r;
ok('start → ok + attempt_id (not resumed)', start.resumed === false && start.attempt_id);
{
  const a = one(await q(`select is_ranked, attempt_purpose::text purpose, archive_date_snapshot, status::text status from attempts where id=$1`, [start.attempt_id]));
  ok('archive attempt is UNRANKED', a.is_ranked === false);
  ok('purpose server-derived = archive', a.purpose === 'archive');
  ok('archive_date_snapshot bound', a.archive_date_snapshot !== null);
  ok('5 attempt_items created (opened)', one(await q(`select count(*)::int c from attempt_items where attempt_id=$1`, [start.attempt_id])).c === 5);
}
// resume
ok('second start resumes the same attempt', one(await q(`select start_archive_attempt($1,(current_date - 1),'s2',null) r`, [PREMIUM])).r.attempt_id === start.attempt_id);
// free denied at the server even via service call
await expectFail('free user cannot start an archive attempt', () => q(`select start_archive_attempt($1,(current_date - 1),'s',null)`, [FREE]), 'archive_locked');
await expectFail('archive of today denied', () => q(`select start_archive_attempt($1,current_date,'s',null)`, [PREMIUM]), 'not_a_past_date');

// =============================================================================
// 4. Ranked isolation (the point of the whole feature)
// =============================================================================
ok('archive attempt is NOT in ranked_result_projection', one(await q(`select count(*)::int c from ranked_result_projection where attempt_id=$1`, [start.attempt_id])).c === 0);
ok('archive attempt does NOT count as ranked (is_ranked=false)', one(await q(`select count(*)::int c from attempts where user_id=$1 and is_ranked=true`, [PREMIUM])).c === 0);
// A real ranked attempt on the SAME pack can still coexist (one-ranked-per-day only counts ranked).
await db.query(`insert into attempts (session_id, user_id, pack_id, is_ranked, status, final_score, completed_at, ranked_date, country_code_snapshot, username_snapshot, active_denominator) values ('rk-sess-000000000',$1,$2,true,'completed',80,now(),current_date - 1,'US','a',100)`, [PREMIUM, PACK]);
ok('a ranked attempt coexists with the archive attempt on the same pack', one(await q(`select count(*)::int c from attempts where user_id=$1 and pack_id=$2`, [PREMIUM, PACK])).c === 2);

// =============================================================================
// 5. Mutation tests (Part N / R Task 51)
// =============================================================================
await expectFail('MUTATION: an archive-marked attempt cannot be ranked', () => q(`insert into attempts (session_id, user_id, pack_id, is_ranked, status, archive_date_snapshot, ranked_date, country_code_snapshot) values ('m-000000000000000',$1,$2,true,'active',current_date-1,current_date-1,'US')`, [PREMIUM, PACK]), 'archive_never_ranked');
await actAs(db, FREE, { isAnonymous: false });
await expectFail('MUTATION: client cannot grant itself premium (player_entitlements RLS)', () => q(`insert into player_entitlements (user_id, entitlement_state) values ($1,'premium')`, [FREE]), 'permission denied|violates');
await expectFail('MUTATION: client cannot call start_archive_attempt (service-role only)', () => q(`select start_archive_attempt($1,(current_date-1),'s',null)`, [FREE]), 'permission denied');
await expectFail('MUTATION: client cannot flip the release policy', () => q(`update release_policy set mode='production_paywall' where id`), 'permission denied|denied');
ok('MUTATION: free entitlement read still archives=false (no client grant path)', one(await q(`select get_my_entitlements() r`)).r.capabilities.archives === false);
await db.exec('reset role;');

if (failures.length) {
  console.error(`\n${failures.length} ARCHIVES CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} archives checks passed — server entitlement gate, sanitized reads, unranked isolation, resume, ranked-fairness invariant, mutations`);
