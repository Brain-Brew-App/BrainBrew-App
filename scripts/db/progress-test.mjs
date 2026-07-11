/**
 * Player progress (streaks / history / statistics) DB tests — `npm run db:progress-test`.
 *
 * Applies the real migrations into PGlite (with real content, for category stats)
 * and proves the Phase 6D progress surface against controlled fixtures:
 *
 *   • UTC streak semantics: first→1, consecutive, missed reset, best>current,
 *     today-incomplete/yesterday-complete RETAINS, leap-year boundary;
 *   • exclusions: practice, anonymous, invalidated; void-recalc day retained;
 *   • lifetime statistics (avg/best/latest/perfect/solve time) + empty/one-day;
 *   • category performance (avg points out of 20, plays, best, perfect);
 *   • history: newest-first, keyset pagination (no dup/gap), private-field free;
 *   • calendar window + first_ranked_date;
 *   • security: anonymous locked, unauthenticated denied, no cross-user param,
 *     direct writes/reads denied;
 *   • idempotency: repeated derivation is identical (no drift);
 *   • mutation sentinels + an EXPLAIN over a realistic per-user history.
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

// --- Real content (for category stats): engines, puzzles, one approved pack ---
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

const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = (r) => (r.length ? r[0] : null);
const call = async (id, sql, params = []) => { await actAs(db, id, { isAnonymous: false }); return one((await db.query(sql, params)).rows); };
const callAnon = async (id, sql, params = []) => { await actAs(db, id, { isAnonymous: true }); return one((await db.query(sql, params)).rows); };

// Dates (UTC).
const today = (await q(`select (now() at time zone 'utc')::date::text d`))[0].d;
const dayOf = async (deltaDays) => (await q(`select ((now() at time zone 'utc')::date + ($1)::int)::text d`, [deltaDays]))[0].d;

const slots = await q(`select id, position, category, max_score from daily_pack_slots where pack_id=$1 order by position`, [packId]);

let seq = 0;
async function mkUser(uname, country = 'AE', anon = false) {
  const id = (await q(`insert into auth.users (id, is_anonymous) values (gen_random_uuid(), $1) returning id`, [anon]))[0].id;
  if (!anon) await db.query(`update profiles set username=$2, username_normalized=lower($2), country_code=$3, display_country=true, onboarding_status='complete' where id=$1`, [id, uname, country]);
  return id;
}
async function rankedDay(userId, date, score, solveMs, opts = {}) {
  seq += 1;
  await db.query(
    `insert into attempts (id, user_id, session_id, pack_id, is_ranked, ranked_date, status, final_score, total_solve_ms, completed_at, country_code_snapshot, username_snapshot, active_denominator, integrity_status)
     values (gen_random_uuid(), $1, $2, $3, $4, $5::date, $6, $7, $8, ${opts.status === 'active' ? 'null' : 'now()'}, $9, $10, 100, $11)`,
    [userId, `prog${String(seq).padStart(12, '0')}`, packId, opts.ranked ?? true, date, opts.status ?? 'completed',
     opts.status === 'active' ? null : score, opts.status === 'active' ? null : solveMs,
     (opts.ranked ?? true) ? (opts.country ?? 'AE') : null, (opts.ranked ?? true) ? (opts.uname ?? 'Snap') : null, opts.integrity ?? 'clean']);
}
/** A ranked day WITH per-slot items (for category stats + real solve time). */
async function rankedDayWithItems(userId, date, scores) {
  seq += 1;
  const aid = (await q(
    `insert into attempts (id, user_id, session_id, pack_id, is_ranked, ranked_date, status, country_code_snapshot, username_snapshot, active_denominator)
     values (gen_random_uuid(), $1, $2, $3, true, $4::date, 'active', 'AE', 'Cat', 100) returning id`,
    [userId, `pit${String(seq).padStart(13, '0')}`, packId, date]))[0].id;
  const base = Date.now() - 86400000;
  for (let i = 0; i < 5; i++) {
    const openedAt = new Date(base).toISOString();
    const submittedAt = new Date(base + (i + 1) * 1000).toISOString(); // 1s,2s,3s,4s,5s → 15s total
    await db.query(
      `insert into attempt_items (attempt_id, slot_id, position, answer_payload, awarded_score, verdict, result_payload, opened_at, submitted_at, status)
       values ($1,$2,$3,'{}'::jsonb,$4,$5,'{}'::jsonb,$6,$7,'submitted')`,
      [aid, slots[i].id, i + 1, scores[i], scores[i] >= 20 ? 'correct' : scores[i] > 0 ? 'partial' : 'incorrect', openedAt, submittedAt]);
  }
  const sum = scores.reduce((a, b) => a + b, 0);
  await db.query(`update attempts set status='completed', final_score=$2, completed_at=now() where id=$1`, [aid, sum]);
  return aid;
}

const d0 = today;
const d1 = await dayOf(-1); const d2 = await dayOf(-2); const d3 = await dayOf(-3);
const d4 = await dayOf(-4); const d5 = await dayOf(-5);

// --- Fixtures ---
const S1 = await mkUser('Streak3');   // d0,d1,d2 → current 3
await rankedDay(S1, d0, 90, 100000); await rankedDay(S1, d1, 80, 110000); await rankedDay(S1, d2, 70, 120000);
const S2 = await mkUser('Yday');      // d1,d2 (not today) → current retained 2
await rankedDay(S2, d1, 85, 90000); await rankedDay(S2, d2, 75, 95000);
const S3 = await mkUser('Broken');    // d3 only → current 0, best 1
await rankedDay(S3, d3, 60, 100000);
const S4 = await mkUser('BestGtCur'); // {d5,d4,d3}=3, {d1,d0}=2 → current 2, best 3
await rankedDay(S4, d5, 50, 100000); await rankedDay(S4, d4, 55, 100000); await rankedDay(S4, d3, 60, 100000);
await rankedDay(S4, d1, 65, 100000); await rankedDay(S4, d0, 70, 100000);
const EMPTY = await mkUser('Empty');
const ONE = await mkUser('OneDay'); await rankedDay(ONE, d0, 100, 80000);
const ST = await mkUser('Stats');     // scores 100,80,90,100 over 4 days
await rankedDay(ST, d0, 100, 60000); await rankedDay(ST, d1, 80, 70000); await rankedDay(ST, d2, 90, 80000); await rankedDay(ST, d3, 100, 90000);
const IV = await mkUser('Invalid');   // d0 clean, d1 invalidated
await rankedDay(IV, d0, 88, 90000); await rankedDay(IV, d1, 99, 50000, { integrity: 'invalidated' });
const VR = await mkUser('VoidRe');    // d0 clean, score 90 (no items → recalc→0)
await rankedDay(VR, d0, 90, 90000);
const PR = await mkUser('Practice');  // practice only (unranked) on d0
await rankedDay(PR, d0, 77, 88000, { ranked: false });
const AN = await mkUser('Anon', 'AE', true);
const CAT = await mkUser('Category');
await rankedDayWithItems(CAT, d0, [20, 10, 15, 20, 5]);
await rankedDayWithItems(CAT, d1, [10, 20, 15, 0, 20]);
const LP = await mkUser('Leap');      // leap-year boundary 2028-02-28/29 + 03-01
await rankedDay(LP, '2028-02-28', 70, 100000); await rankedDay(LP, '2028-02-29', 75, 100000); await rankedDay(LP, '2028-03-01', 80, 100000);

const summary = (id) => call(id, `select get_my_progress_summary($1::date) r`, [today]).then((x) => x.r);

// =============================================================================
// 1. Streak semantics
// =============================================================================
{
  const s1 = await summary(S1);
  ok('three consecutive days → current streak 3, today complete', s1.current_streak === 3 && s1.best_streak === 3 && s1.today_completed === true && s1.ranked_days_completed === 3);
  const s2 = await summary(S2);
  ok('yesterday complete, today NOT → current streak retained (2), not 0', s2.current_streak === 2 && s2.today_completed === false && s2.last_ranked_date === d1);
  const s3 = await summary(S3);
  ok('a missed gap resets → current streak 0, best 1', s3.current_streak === 0 && s3.best_streak === 1);
  const s4 = await summary(S4);
  ok('best streak can exceed current (best 3, current 2)', s4.best_streak === 3 && s4.current_streak === 2);
  const one = await summary(ONE);
  ok('first-ever completion today → streak 1', one.current_streak === 1 && one.ranked_days_completed === 1);
  const empty = await summary(EMPTY);
  ok('empty player → streak 0, no scores', empty.current_streak === 0 && empty.ranked_days_completed === 0 && empty.latest_score === null && empty.best_streak === 0);
  const lp = await summary(LP);
  ok('leap-year boundary (Feb 28 → 29 → Mar 1) → best streak 3', lp.best_streak === 3);
}

// =============================================================================
// 2. Exclusions + void recalculation
// =============================================================================
{
  const pr = await summary(PR);
  ok('practice attempts never count toward the streak', pr.current_streak === 0 && pr.ranked_days_completed === 0);
  const an = await callAnon(AN, `select get_my_progress_summary($1::date) r`, [today]);
  ok('anonymous user is locked out of progress', an.r.locked === true && !('current_streak' in an.r));
  const iv = await summary(IV);
  ok('invalidated day excluded (only the clean day counts)', iv.ranked_days_completed === 1 && iv.current_streak === 1);

  // Void recalc: VR has no items → recalc drops score to 0 but the day still counts.
  await db.exec(`reset role;`);
  const vrId = one(await q(`select id from attempts where user_id=$1 and ranked_date=$2::date`, [VR, d0])).id;
  await q(`select recalculate_ranked_result($1)`, [vrId]);
  const vr = await summary(VR);
  ok('void-recalculated day is retained and reflects the corrected score', vr.current_streak === 1 && vr.latest_score === 0 && vr.ranked_days_completed === 1);
}

// =============================================================================
// 3. Lifetime statistics
// =============================================================================
{
  const st = await summary(ST);
  ok('average score is exact (100,80,90,100 → 92.5)', Number(st.average_score) === 92.5);
  ok('best score is 100; latest is the most recent day (d0 → 100)', st.best_score === 100 && st.latest_score === 100);
  ok('perfect-score count is 2', st.perfect_scores === 2);
  ok('lifetime sum + average solve time present', Number(st.lifetime_score_sum) === 370 && st.average_solve_ms !== null);
  ok('statistics carry a version', st.statistics_version === 1);
}

// =============================================================================
// 4. Category statistics
// =============================================================================
{
  const detail = (await call(CAT, `select get_my_progress_detail(35, $1::date) r`, [today])).r;
  const byCat = Object.fromEntries(detail.categories.map((c) => [c.category, c]));
  // observation (pos 1): scores 20 & 10 → avg 15, best 20, plays 2, perfect 1
  ok('category avg points out of 20 is exact', Number(byCat.observation.average_points) === 15 && byCat.observation.best_points === 20);
  ok('category play count is per ranked day (2)', byCat.observation.plays === 2 && byCat.pattern.plays === 2);
  ok('category perfect count (awarded == max) is exact', byCat.observation.perfect === 1 && byCat.pattern.perfect === 1);
  ok('all five categories are present', detail.categories.length === 5);
}

// =============================================================================
// 5. History + calendar
// =============================================================================
{
  const h = (await call(ST, `select get_my_ranked_history(null, 2) r`)).r;
  ok('history is newest first, page size honored', h.rows.length === 2 && h.rows[0].ranked_date === d0 && h.rows[1].ranked_date === d1 && h.has_more === true);
  const h2 = (await call(ST, `select get_my_ranked_history($1::date, 2) r`, [h.next_before])).r;
  ok('history next page continues with no dup / no gap', h2.rows[0].ranked_date === d2 && h2.rows[1].ranked_date === d3);
  const allDates = [...h.rows, ...h2.rows].map((r) => r.ranked_date);
  ok('history pages cover all days once', new Set(allDates).size === 4 && allDates.length === 4);
  ok('history rows carry no user_id / attempt id / integrity / email',
    h.rows.every((r) => !('user_id' in r) && !('attempt_id' in r) && !('id' in r) && !('integrity_status' in r) && !('email' in r)));

  const detail = (await call(S1, `select get_my_progress_detail(35, $1::date) r`, [today])).r;
  const done = detail.calendar.completed.map((c) => c.date);
  ok('calendar lists the completed days in the window', done.includes(d0) && done.includes(d1) && done.includes(d2) && detail.calendar.first_ranked_date === d2);
  ok('calendar reports today + window start', detail.calendar.today === d0 && typeof detail.calendar.from_date === 'string');
}

// =============================================================================
// 6. Security
// =============================================================================
{
  // No user parameter exists on any progress function → no cross-user injection.
  await db.exec(`reset role;`);
  const params = await q(`select count(*)::int c from information_schema.parameters where specific_name like 'get_my_progress_summary%' and parameter_name ilike '%user%'`);
  ok('get_my_progress_summary has no user parameter', params[0].c === 0);

  // Unauthenticated (anon publishable role) denied.
  await db.exec(`set role anon;`);
  await expectFail('anon (publishable) cannot call get_my_progress_summary', () => db.query(`select get_my_progress_summary()`), 'permission denied');
  await expectFail('anon (publishable) cannot call get_my_ranked_history', () => db.query(`select get_my_ranked_history()`), 'permission denied');
  await db.exec(`reset role;`);

  // A permanent user cannot read the attempts table directly, nor write it.
  await actAs(db, S1, { isAnonymous: false });
  await expectFail('direct attempts read is denied (no table grant)', () => db.query(`select count(*) from attempts`), 'permission denied');
  await expectFail('direct attempts write is denied', () => db.query(`update attempts set final_score=1 where user_id=$1`, [S1]), 'permission denied');
  await actAs(db, null);
  await db.exec(`reset role;`);

  // Each user only ever sees their own derivation (auth.uid()).
  const s1 = await summary(S1); const st = await summary(ST);
  ok('each caller gets only their own summary (auth.uid scoped)', s1.ranked_days_completed === 3 && st.ranked_days_completed === 4);
}

// =============================================================================
// 7. Idempotency (no drift) + mutation sentinels
// =============================================================================
{
  const a = await summary(ST); const b = await summary(ST); const c = await summary(ST);
  ok('repeated derivation is identical (no drift on rebuild)', JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c));

  await db.exec(`reset role;`);
  // MUTATION: counting practice would give PR a streak — prove the filter is load-bearing.
  const practiceCount = one(await q(`select count(*)::int c from attempts where user_id=$1`, [PR])).c;
  ok('MUTATION: practice is present but excluded (dropping is_ranked would change PR)', practiceCount === 1 && (await summary(PR)).current_streak === 0);

  // MUTATION: the yesterday rule — a stricter "must be today" would zero S2.
  const s2 = await summary(S2);
  const strict = s2.last_ranked_date === today ? s2.current_streak : 0; // what "today-only" would yield
  ok('MUTATION: a today-only rule would break S2 (yesterday-retain is load-bearing)', s2.current_streak === 2 && strict === 0);

  // MUTATION: including invalidated would give IV 2 days.
  await db.exec(`reset role;`);
  const ivAll = one(await q(`select count(*)::int c from attempts where user_id=$1 and is_ranked and status='completed'`, [IV])).c;
  ok('MUTATION: dropping the integrity filter would add the invalidated day', ivAll === 2 && (await summary(IV)).ranked_days_completed === 1);

  // MUTATION: a wrong (client-local) date changes today_completed — proving the
  // date must be server-derived UTC (the client omits p_today).
  const tomorrow = await dayOf(1);
  const wrong = (await call(S1, `select get_my_progress_summary($1::date) r`, [tomorrow])).r;
  ok('MUTATION: a wrong local date flips today_completed (UTC must be server-derived)', wrong.today_completed === false && (await summary(S1)).today_completed === true);
}

// =============================================================================
// 8. Query plan — the per-user valid-ranked index serves streak/history at volume
// =============================================================================
{
  await db.exec(`reset role;`);
  // Noise: ~2000 other users, one ranked day each on a random past date, so a
  // user_id filter is genuinely selective (the composite user-first index wins).
  await db.exec(`
    with u as (
      insert into auth.users (id, is_anonymous) select gen_random_uuid(), false from generate_series(1, 2000) returning id
    )
    insert into attempts (user_id, session_id, pack_id, is_ranked, ranked_date, status, final_score, total_solve_ms, completed_at, country_code_snapshot, username_snapshot, active_denominator, integrity_status)
      select u.id, 'noise' || lpad((row_number() over ())::text, 11, '0'), '${packId}', true,
             ((now() at time zone 'utc')::date - (1 + floor(random() * 400))::int), 'completed',
             (random()*100)::int, (random()*200000)::bigint, now(), 'AE', 'N', 100, 'clean'
        from u;`);
  const VOL = (await q(`insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id`))[0].id;
  await db.query(`update profiles set username='Vol', username_normalized='vol', country_code='AE', onboarding_status='complete' where id=$1`, [VOL]);
  // 300 distinct ranked days for the one user under test.
  await db.query(`
    insert into attempts (user_id, session_id, pack_id, is_ranked, ranked_date, status, final_score, total_solve_ms, completed_at, country_code_snapshot, username_snapshot, active_denominator, integrity_status)
      select $1, 'vol' || lpad(g::text, 13, '0'), $2, true, ((now() at time zone 'utc')::date - g), 'completed',
             (random()*100)::int, (random()*200000)::bigint, now(), 'AE', 'Vol', 100, 'clean'
        from generate_series(1, 300) g;`, [VOL, packId]);
  await db.exec(`analyze attempts;`);
  const histSql = `explain (analyze, format text)
    select ranked_date, final_score from attempts
     where user_id = '${VOL}' and is_ranked and status='completed' and integrity_status='clean'
     order by ranked_date desc limit 30`;
  await db.exec(`set enable_seqscan = off; set enable_bitmapscan = off;`);
  const plan = (await q(histSql)).map((r) => r['QUERY PLAN']).join('\n');
  await db.exec(`set enable_seqscan = on; set enable_bitmapscan = on;`);
  ok('attempts_user_valid_ranked_idx serves the newest-first history with no Sort',
    /Index Scan using attempts_user_valid_ranked_idx/.test(plan) && !/\bSort\b/i.test(plan));
  console.log(`\n  plan (history, index path): ${plan.split('\n').find((l) => /Index Scan/.test(l))?.trim() ?? plan.split('\n')[0].trim()}`);
}

if (failures.length) {
  console.error(`\n${failures.length} PROGRESS DB CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} progress DB checks passed — streaks, exclusions, statistics, category, history, calendar, security, idempotency`);
