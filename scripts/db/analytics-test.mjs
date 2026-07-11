/**
 * Analytics ingestion + rollups + retention/funnel DB tests — `npm run db:analytics-test`.
 *
 * Proves Phase 7G analytics:
 *   • ingest_analytics_events: allowlist, forbidden-field/oversized rejection,
 *     dedup, spoofed-user ignored (user derived by caller), batch cap;
 *   • test-user exclusion (analytics_subject_flags) applied consistently;
 *   • daily rollups derived from canonical data, idempotent + correcting on rerun;
 *   • retention cohorts (elapsed → value, unelapsed horizon → null);
 *   • activation funnel counts;
 *   • security: clients cannot write analytics_events or call the RPCs.
 */

import { freshDb, actAs } from './pglite-harness.mjs';

const db = await freshDb();
await db.exec(`set time zone 'UTC';`);
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = (r) => (r.length ? r[0] : null);
const svc = async () => { await actAs(db, null); };
const asUser = (id) => actAs(db, id, { isAnonymous: false });

let passed = 0; const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
async function expectFail(name, fn, matcher) {
  try { await fn(); failures.push(`${name} — expected rejection`); }
  catch (e) { if (matcher && !new RegExp(matcher, 'i').test(e.message)) failures.push(`${name} — wrong: ${e.message.split('\n')[0]}`); else passed++; }
}
const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';
const PX = '33333333-3333-3333-3333-333333333333'; // excluded test user
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false),($2,false),($3,false)`, [P1, P2, PX]);
const ingest = async (uid, events) => one(await q(`select ingest_analytics_events($1,false,$2::jsonb) r`, [uid, JSON.stringify(events)])).r;

// =============================================================================
// 1. Ingestion validation
// =============================================================================
await svc();
ok('valid event accepted', (await ingest(P1, [{ event_name: 'home_ranked_cta_viewed', platform: 'ios', dedup_key: 'e1' }])).accepted === 1);
ok('unknown event rejected', (await ingest(P1, [{ event_name: 'totally_made_up', platform: 'ios', dedup_key: 'e2' }])).rejected === 1);
ok('forbidden property (answer) rejected', (await ingest(P1, [{ event_name: 'reveal_viewed', platform: 'ios', properties: { correct_answer: 'x' }, dedup_key: 'e3' }])).rejected === 1);
ok('email property rejected', (await ingest(P1, [{ event_name: 'reveal_viewed', platform: 'ios', properties: { email: 'a@b.c' }, dedup_key: 'e3b' }])).rejected === 1);
ok('bad platform rejected', (await ingest(P1, [{ event_name: 'reveal_viewed', platform: 'nintendo', dedup_key: 'e4' }])).rejected === 1);
ok('duplicate dedup_key ignored on second send', (await ingest(P1, [{ event_name: 'home_ranked_cta_viewed', platform: 'ios', dedup_key: 'e1' }])).accepted === 0);
const big = Array.from({ length: 60 }, (_, i) => ({ event_name: 'screen_viewed', platform: 'web', dedup_key: `b${i}` }));
ok('batch over 50 rejected', (await ingest(P1, big)).error === 'batch_too_large');
// Spoofed user_id in the body is IGNORED — the row is written for the caller-derived p_user.
await ingest(P2, [{ event_name: 'app_opened', platform: 'android', user_id: P1, dedup_key: 'spoof1' }]);
ok('spoofed user_id in body ignored (row belongs to caller-derived user)',
  one(await q(`select user_id from analytics_events where dedup_key='spoof1'`)).user_id === P2);

// =============================================================================
// 2. Test-user exclusion
// =============================================================================
await svc();
await q(`select set_subject_flag($1,true,'automated test','test',null)`, [PX]);
ok('flagged user is excluded', one(await q(`select analytics_excluded($1) e`, [PX])).e === true);
ok('normal user not excluded', one(await q(`select analytics_excluded($1) e`, [P1])).e === false);

// =============================================================================
// 3. Rollups from canonical data (exclusion-aware, idempotent)
// =============================================================================
const PACK = 'cccccccc-0000-0000-0000-000000000001';
await q(`insert into daily_packs (pack_id, pack_date, pack_index, difficulty_label, status, content_hash) values ($1, current_date, 0, 'standard','draft', repeat('a',64))`, [PACK]);
// Today: ranked completed P1=80, P2=60, PX=100 (excluded); practice completed P1.
await q(`insert into attempts (user_id, session_id, pack_id, is_ranked, ranked_date, status, active_denominator, final_score, completed_at, country_code_snapshot, username_snapshot)
  values ($1,'rk00000000000001',$4,true,current_date,'completed',100,80,now(),'AE','A'),
         ($2,'rk00000000000002',$4,true,current_date,'completed',100,60,now(),'AE','B'),
         ($3,'rk00000000000003',$4,true,current_date,'completed',100,100,now(),'AE','X')`, [P1, P2, PX, PACK]);
await q(`insert into practice_packs (id, user_id, selection_seed, exclusion_date) values ('dddddddd-0000-0000-0000-000000000001',$1,'s',current_date)`, [P1]);
await q(`insert into attempts (user_id, session_id, practice_pack_id, is_ranked, status, active_denominator, final_score, completed_at)
  values ($1,'pr00000000000001','dddddddd-0000-0000-0000-000000000001',false,'completed',100,70,now())`, [P1]);

await svc();
await q(`select rebuild_analytics_rollups(current_date, current_date)`);
let g = one(await q(`select * from analytics_gameplay_daily where day=current_date`));
ok('gameplay rollup: ranked_completions excludes the flagged user (2 not 3)', g.ranked_completions === 2);
ok('gameplay rollup: avg_score = 70 (80,60; PX excluded)', Number(g.avg_score) === 70);
ok('gameplay rollup: practice completions counted', g.practice_completions === 1);
let u = one(await q(`select * from analytics_user_daily where day=current_date`));
ok('user rollup: active_users excludes flagged user (2)', u.active_users === 2);

// Idempotent: rerun → identical.
await q(`select rebuild_analytics_day(current_date)`);
let g2 = one(await q(`select ranked_completions, avg_score from analytics_gameplay_daily where day=current_date`));
ok('rollup rerun is idempotent', g2.ranked_completions === 2 && Number(g2.avg_score) === 70);

// Late-arriving correction: a new practice completion lands after the first
// rollup → rerunning the day picks it up (1 → 2).
await q(`insert into practice_packs (id, user_id, selection_seed, exclusion_date) values ('dddddddd-0000-0000-0000-000000000002',$1,'s',current_date)`, [P2]);
await q(`insert into attempts (user_id, session_id, practice_pack_id, is_ranked, status, active_denominator, final_score, completed_at)
  values ($1,'pr00000000000002','dddddddd-0000-0000-0000-000000000002',false,'completed',100,55,now())`, [P2]);
await q(`select rebuild_analytics_day(current_date)`);
ok('rollup corrects on rerun after a late practice completion (1→2)', one(await q(`select practice_completions from analytics_gameplay_daily where day=current_date`)).practice_completions === 2);

// =============================================================================
// 4. Retention cohorts (practice attempts across days for P2)
// =============================================================================
await svc();
await q(`insert into practice_packs (id, user_id, selection_seed, exclusion_date) values ('dddddddd-0000-0000-0000-000000000010',$1,'s',current_date-10),('dddddddd-0000-0000-0000-000000000011',$1,'s',current_date-9)`, [P2]);
await q(`insert into attempts (user_id, session_id, practice_pack_id, is_ranked, status, active_denominator, final_score, completed_at, created_at)
  values ($1,'ph00000000000010','dddddddd-0000-0000-0000-000000000010',false,'completed',100,50, now()-interval '10 days', now()-interval '10 days'),
         ($1,'ph00000000000011','dddddddd-0000-0000-0000-000000000011',false,'completed',100,50, now()-interval '9 days', now()-interval '9 days')`, [P2]);
const rows = one(await q(`select admin_retention((current_date-10)::date, current_date) r`)).r;
const cohort10 = rows.find((c) => c.cohort === new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10));
const cohortToday = rows.find((c) => c.cohort === new Date().toISOString().slice(0, 10));
ok('retention: 10-day-old cohort D1 = 1.0 (P2 returned next day)', cohort10 && Number(cohort10.d1) === 1);
ok('retention: today cohort D1 = null (window not elapsed)', cohortToday && cohortToday.d1 === null);

// =============================================================================
// 5. Activation funnel
// =============================================================================
const fn = one(await q(`select admin_activation_funnel((current_date-1)::date, current_date) f`)).f;
ok('funnel: ranked_started distinct users excludes flagged (P1,P2)', fn.ranked_started === 2);
ok('funnel: ranked_completed distinct users (P1,P2)', fn.ranked_completed === 2);

// =============================================================================
// 6. Security
// =============================================================================
await asUser(P1);
await expectFail('client cannot INSERT analytics_events', () => q(`insert into analytics_events (event_name, occurred_at) values ('app_opened', now())`), 'permission denied');
await expectFail('client cannot read analytics_events', () => q(`select * from analytics_events`), 'permission denied');
await expectFail('client cannot call ingest_analytics_events', () => q(`select ingest_analytics_events($1,false,'[]'::jsonb)`, [P1]), 'permission denied');
await expectFail('client cannot call rebuild_analytics_rollups', () => q(`select rebuild_analytics_rollups(current_date,current_date)`), 'permission denied');
await expectFail('client cannot call admin_retention', () => q(`select admin_retention(current_date,current_date)`), 'permission denied');
await expectFail('client cannot read rollup tables', () => q(`select * from analytics_gameplay_daily`), 'permission denied');
await expectFail('client cannot set subject flags', () => q(`select set_subject_flag($1,true,'x','y',null)`, [P1]), 'permission denied');
await db.exec('reset role;');

if (failures.length) {
  console.error(`\n${failures.length} ANALYTICS DB CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} analytics DB checks passed — ingestion, exclusion, rollups (idempotent+correcting), retention, funnel, security`);
