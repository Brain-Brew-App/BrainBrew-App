/**
 * Reserve-based Practice DB tests — `npm run db:practice-test`.
 *
 * Loads the real 314-puzzle library (so the ~64 reserve puzzles exist), publishes
 * a ranked pack for today, and exercises `start_practice_pack`:
 *
 *   • selection: five slots, one per category in fixed order, no dup puzzle,
 *     RESERVE-only, never today's ranked puzzles;
 *   • lifecycle: resume the active attempt; a new pack after completion;
 *   • recent-exposure avoidance where the pool allows;
 *   • isolation: practice never enters leaderboards / streaks / projection /
 *     ranked uniqueness;
 *   • reserve-content safety: puzzles, daily packs, and slots are unchanged;
 *   • security: functions + tables are service-role only (client denied);
 *   • pool exhaustion → a safe error, never an incomplete pack;
 *   • mutation sentinels + an EXPLAIN.
 */

import { freshDb, actAs, upsert, count } from './pglite-harness.mjs';
import { buildAllRows } from './build-rows.mjs';

let passed = 0;
const failures = [];
const ok = (name, cond) => (cond ? passed++ : failures.push(name));
async function expectFail(name, fn, matcher) {
  try { await fn(); failures.push(`${name} — expected rejection, but it succeeded`); }
  catch (e) { if (matcher && !new RegExp(matcher, 'i').test(e.message)) failures.push(`${name} — wrong reason: ${e.message.split('\n')[0]}`); else passed++; }
}

const db = await freshDb();
const rows = await buildAllRows();
await upsert(db, 'puzzle_engines', rows.engines, 'engine_id');
await upsert(db, 'puzzle_seeds', rows.seeds, 'seed_id');
await upsert(db, 'puzzles', rows.puzzles.map((p) => ({ ...p, status: 'draft' })), 'puzzle_id');
await upsert(db, 'puzzle_answers', rows.answers, 'puzzle_id');
if ((await count(db, 'puzzle_validation_results')) === 0) {
  for (const v of rows.validations) {
    await db.query(
      `insert into puzzle_validation_results (puzzle_id, validator_version, passed, findings, validation_hash, validation_source)
       values ($1,$2,$3,$4::jsonb,$5,$6)`,
      [v.puzzle_id, v.validator_version, v.passed, JSON.stringify(v.findings), v.validation_hash, v.validation_source]);
  }
}
await db.exec(`update puzzles set status='approved', approved_at=now() where status='draft';`);
await upsert(db, 'daily_packs', rows.packs.map((p) => ({ ...p, status: 'draft' })), 'pack_id');
await upsert(db, 'daily_pack_slots', rows.slots, ['pack_id', 'position']);
await db.exec(`update daily_packs set status='approved' where status='draft';`);
const packId = rows.packs.find((p) => p.pack_index === 0).pack_id;
const today = (await db.query(`select (now() at time zone 'utc')::date::text d`)).rows[0].d;
await db.query(`select publish_pack($1, $2::date)`, [packId, today]);

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = (r) => (r.length ? r[0] : null);

// Reference sets.
const reserveIds = new Set([...rows.reserveIds]);
const todayRanked = new Set((await q(`select puzzle_id from daily_pack_slots where pack_id=$1`, [packId])).map((r) => r.puzzle_id));
const CATS = ['observation', 'pattern', 'logic', 'language-logic', 'attention-speed'];

const U = '11111111-1111-1111-1111-111111111111';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false)`, [U]);
await db.query(`update profiles set username='Prac', username_normalized='prac', country_code='AE', onboarding_status='complete' where id=$1`, [U]);

const start = async (user = U, session = 'practiceinstall01') => one(await q(`select start_practice_pack($1,$2,'1.0.0') r`, [user, session])).r;

// =============================================================================
// 1. Selection correctness
// =============================================================================
const p1 = await start();
ok('a practice pack has five slots', p1.slots.length === 5 && p1.resumed === false);
ok('slots are the five categories in fixed order', p1.slots.map((s) => s.category).join() === CATS.join());
ok('slot positions are 1..5', p1.slots.map((s) => s.position).join() === '1,2,3,4,5');
ok('no duplicate puzzle in the pack', new Set(p1.slots.map((s) => s.puzzle_id)).size === 5);
// HARD guarantees: never today's ranked, and RESERVE-ONLY for every category
// (Phase 7C — Observation reserve now exists, so no fallback to scheduled content).
ok('no practice puzzle is one of today\'s ranked puzzles', p1.slots.every((s) => !todayRanked.has(s.puzzle_id)));
ok('EVERY practice puzzle (incl. Observation) is reserve content', p1.slots.every((s) => reserveIds.has(s.puzzle_id)));
ok('slots carry render payload but NO answer fields',
  p1.slots.every((s) => s.prompt && s.public_payload && s.public_payload.timing
    && !['oddTileId', 'correctOptionId', 'targetIds', 'pairTileIds', 'correctOrder', 'explanation'].some((k) => k in s.public_payload)));
{
  const att = one(await q(`select is_ranked, attempt_purpose, status, practice_pack_id, pack_id, active_denominator from attempts where id=$1`, [p1.attempt_id]));
  ok('the practice attempt is unranked + purpose practice + bound to the pack',
    att.is_ranked === false && att.attempt_purpose === 'practice' && att.status === 'active' && att.practice_pack_id === p1.practice_pack_id && att.pack_id === null && att.active_denominator === 100);
}

// =============================================================================
// 2. Resume + new-after-completion lifecycle
// =============================================================================
{
  const resume = await start();
  ok('starting again resumes the SAME active practice attempt', resume.resumed === true && resume.attempt_id === p1.attempt_id && resume.practice_pack_id === p1.practice_pack_id);
  ok('resume returns the same five puzzles', resume.slots.map((s) => s.puzzle_id).join() === p1.slots.map((s) => s.puzzle_id).join());

  // Complete it, then a fresh start makes a NEW pack.
  await db.query(`update attempts set status='completed', final_score=50, completed_at=now() where id=$1`, [p1.attempt_id]);
  const p2 = await start();
  ok('after completion a NEW practice pack + attempt is created', p2.resumed === false && p2.attempt_id !== p1.attempt_id && p2.practice_pack_id !== p1.practice_pack_id);
  ok('the new pack is five puzzles in fixed order, none of today\'s ranked', p2.slots.length === 5 && p2.slots.every((s) => !todayRanked.has(s.puzzle_id)) && p2.slots.map((s) => s.category).join() === CATS.join());
  await db.query(`update attempts set status='completed', final_score=50, completed_at=now() where id=$1`, [p2.attempt_id]);
}

// =============================================================================
// 3. Recent-exposure avoidance (where the pool allows)
// =============================================================================
{
  // Play several practices; each new pack should avoid the immediately-previous
  // puzzles per category while eligible alternatives exist.
  const seen = [];
  let prev = null;
  for (let i = 0; i < 4; i++) {
    const p = await start();
    seen.push(p.slots.map((s) => s.puzzle_id));
    if (prev) {
      // For each category, count how many reserve puzzles exist; if >1, the new
      // pick should differ from the immediately previous one.
      for (let pos = 0; pos < 5; pos++) {
        const cat = CATS[pos];
        const poolN = [...reserveIds].filter((id) => rows.puzzles.find((x) => x.puzzle_id === id)?.category === cat).length;
        if (poolN > 1) ok(`recent-exposure: ${cat} pick avoids the immediately previous puzzle (pool ${poolN})`, p.slots[pos].puzzle_id !== prev[pos].puzzle_id);
      }
    }
    prev = p.slots;
    await db.query(`update attempts set status='completed', final_score=50, completed_at=now() where id=$1`, [p.attempt_id]);
  }
}

// =============================================================================
// 4. Ranked isolation + reserve-content safety
// =============================================================================
{
  // Snapshot canonical content, then confirm practice changed none of it.
  const before = one(await q(`select
    (select count(*)::int from puzzles) puzzles,
    (select count(*)::int from puzzles where status='approved') approved,
    (select count(*)::int from daily_pack_slots) slots,
    (select count(*)::int from daily_packs where status='live') live,
    (select coalesce(sum(('x'||substr(md5(content_hash),1,8))::bit(32)::bigint),0) from puzzles) hashsum`));

  await start(); // another practice
  const after = one(await q(`select
    (select count(*)::int from puzzles) puzzles,
    (select count(*)::int from puzzles where status='approved') approved,
    (select count(*)::int from daily_pack_slots) slots,
    (select count(*)::int from daily_packs where status='live') live,
    (select coalesce(sum(('x'||substr(md5(content_hash),1,8))::bit(32)::bigint),0) from puzzles) hashsum`));
  ok('practice does not change puzzle count / approval / content hashes', before.puzzles === after.puzzles && before.approved === after.approved && String(before.hashsum) === String(after.hashsum));
  ok('practice adds NO daily slots and publishes NO packs (scheduler output unchanged)', before.slots === after.slots && before.live === after.live);
  // Reserve puzzles used in practice are NEVER inserted into daily_pack_slots — the
  // only puzzle_ids shared with daily_pack_slots are the fallback (observation)
  // ones, which were already scheduled and are untouched by practice.
  ok('practice never writes a puzzle INTO daily_pack_slots', before.slots === (await q(`select count(*)::int c from daily_pack_slots`))[0].c);

  // Isolation from ranked surfaces (practice attempts are is_ranked=false).
  ok('practice attempts never appear in ranked_result_projection', (await q(`select count(*)::int c from ranked_result_projection`))[0].c === 0);
  await actAs(db, U, { isAnonymous: false });
  const streak = one(await q(`select get_my_progress_summary($1::date) r`, [today])).r;
  ok('practice never counts toward the streak', streak.ranked_days_completed === 0 && streak.current_streak === 0);
  const lb = one(await q(`select get_daily_leaderboard('global', $1::date, 0, 50) r`, [today])).r;
  ok('practice never enters the leaderboard', lb.total === 0);
  await actAs(db, null);
  await db.exec(`reset role;`);
}

// =============================================================================
// 5. Security — functions + tables are service-role only
// =============================================================================
{
  await actAs(db, U, { isAnonymous: false });
  await expectFail('authenticated cannot call start_practice_pack directly', () => db.query(`select start_practice_pack($1,'x2installxxxxxxx','1.0.0')`, [U]), 'permission denied');
  await expectFail('authenticated cannot read practice_packs', () => db.query(`select * from practice_packs limit 1`), 'permission denied');
  await expectFail('authenticated cannot read practice_pack_slots', () => db.query(`select * from practice_pack_slots limit 1`), 'permission denied');
  await actAs(db, null);
  await db.exec(`reset role;`);
  await db.exec(`set role anon;`);
  await expectFail('anon cannot call start_practice_pack', () => db.query(`select start_practice_pack('${U}','x3installxxxxxxx','1.0.0')`), 'permission denied');
  await db.exec(`reset role;`);
  // Practice pack slots are immutable.
  const sp = one(await q(`select practice_pack_id from practice_pack_slots limit 1`));
  await expectFail('practice pack slots are immutable', () => db.query(`update practice_pack_slots set max_score=1 where practice_pack_id=$1`, [sp.practice_pack_id]), 'immutable');
}

// =============================================================================
// 6. Pool exhaustion → safe error (never an incomplete pack)
// =============================================================================
{
  const V = '22222222-2222-2222-2222-222222222222';
  await db.query(`insert into auth.users (id, is_anonymous) values ($1,false)`, [V]);
  // Retire EVERY approved puzzle in one category → that category has no eligible
  // pool at all → a full fresh pack is impossible.
  await db.query(`update puzzles set status='retired', retired_at=now() where category='observation'`);
  await expectFail('an exhausted category yields a safe error, not a short pack', () => db.query(`select start_practice_pack($1,'poolinstallxxxxx','1.0.0')`, [V]), 'practice_pool_exhausted');
  await db.query(`update puzzles set status='approved' where status='retired' and category='observation'`);
}

// =============================================================================
// 7. Mutation sentinels
// =============================================================================
{
  // Dropping the reserve filter would let today's ranked puzzles be selectable.
  const rankedSelectable = (await q(`select count(*)::int c from puzzles p where p.status='approved' and p.puzzle_id = any($1)`, [[...todayRanked]]))[0].c;
  ok('MUTATION: today\'s ranked puzzles are approved (so only the reserve+exclusion filters keep them out)', rankedSelectable === 5);
  // The real selection never included one (asserted in section 1). Reserve ∩ today-ranked is empty by construction:
  ok('MUTATION: reserve and today-ranked sets are disjoint (reserve filter is load-bearing)', [...todayRanked].every((id) => !reserveIds.has(id)));
  // Scheduled Observation puzzles exist — so the reserve-only filter is exactly
  // what keeps them out of Practice (dropping it would re-admit scheduled content).
  const scheduledObs = (await q(`select count(*)::int c from puzzles p where p.category='observation' and p.status='approved' and exists (select 1 from daily_pack_slots ds where ds.puzzle_id=p.puzzle_id)`))[0].c;
  ok('MUTATION: dropping the reserve-only filter would re-admit scheduled Observation puzzles', scheduledObs >= 5);
}

// =============================================================================
// 8. Query plan — active-practice lookup uses its partial index
// =============================================================================
{
  await db.exec(`analyze attempts;`);
  await db.exec(`set enable_seqscan = off;`);
  const plan = (await q(`explain (format text) select id from attempts where user_id='${U}' and attempt_purpose='practice' and status='active'`)).map((r) => r['QUERY PLAN']).join('\n');
  await db.exec(`set enable_seqscan = on;`);
  ok('active-practice lookup can use attempts_one_active_practice', /attempts_one_active_practice|Index/.test(plan));
  console.log(`\n  plan (active practice lookup): ${plan.split('\n').find((l) => /Scan/.test(l))?.trim() ?? plan.split('\n')[0].trim()}`);
}

if (failures.length) {
  console.error(`\n${failures.length} PRACTICE DB CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} reserve-practice DB checks passed — selection, lifecycle, isolation, reserve safety, security`);
