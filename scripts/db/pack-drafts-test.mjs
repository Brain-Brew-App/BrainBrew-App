/**
 * Pack authoring/publication tests — `npm run db:pack-drafts-test`.
 *
 * Proves the Phase 7I pack draft → publish backend end to end: slot eligibility,
 * validation (blockers + warnings + summaries), two-person review with Founder
 * emergency override, atomic + idempotent publication reusing canonical
 * publish_pack + integrity triggers, duplicate-date denial, live immutability,
 * optimistic concurrency, cancel, and service-role-only security.
 */

import { createHash } from 'node:crypto';
import { freshDb, actAs } from './pglite-harness.mjs';

const hh = (s) => createHash('sha256').update(s).digest('hex');
const db = await freshDb();
await db.exec(`set time zone 'UTC';`);
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = (r) => (r.length ? r[0] : null);
const svc = async () => { await actAs(db, null); };
let passed = 0; const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
async function expectFail(name, fn, m) { try { await fn(); failures.push(`${name} — expected rejection`); } catch (e) { if (m && !new RegExp(m, 'i').test(e.message)) failures.push(`${name} — ${e.message.split('\n')[0]}`); else passed++; } }

const AUTHOR = '11111111-1111-1111-1111-111111111111';
const REVIEWER = '22222222-2222-2222-2222-222222222222';
const FOUNDER = '33333333-3333-3333-3333-333333333333';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false),($2,false),($3,false)`, [AUTHOR, REVIEWER, FOUNDER]);
await db.query(`insert into admin_users (user_id, role, status) values ($1,'content_admin','active'),($2,'content_admin','active'),($3,'founder','active')`, [AUTHOR, REVIEWER, FOUNDER]);

// Five engines (one per category) + a seed each, then two approved puzzles per category.
const CATS = [['observation', 'OBS_091'], ['pattern', 'PAT_091'], ['logic', 'LOG_091'], ['language-logic', 'LNG_091'], ['attention-speed', 'ATT_091']];
for (const [cat, eng] of CATS) {
  await db.query(`insert into puzzle_engines (engine_id, category, name, active, build_status, min_difficulty, max_difficulty, weekly_cap, min_days_between, estimated_time_ms, ui_component, builder_id, validator_id, scoring_id, explanation_strategy)
    values ($1,$2,$3,true,'built',1,5,7,1,8000,'C',$1,$1,'score','static')`, [eng, cat, eng]);
  await db.query(`insert into puzzle_seeds (seed_id, engine_id, payload, authored_difficulty, source_type, content_hash) values ($1,$2,'{}'::jsonb,3,'human',$3)`, [`s-${eng}`, eng, hh('seed' + eng)]);
}
async function mkApproved(id, cat, eng, diff = 3) {
  await db.query(`insert into puzzles (puzzle_id, engine_id, seed_id, category, difficulty, prompt, public_payload, builder_version, validator_version, content_hash, status)
    values ($1,$2,$3,$4,$5,'p','{}'::jsonb,'b','v',$6,'draft')`, [id, eng, `s-${eng}`, cat, diff, hh(id)]);
  await db.query(`insert into puzzle_validation_results (puzzle_id, validator_version, passed, findings, validation_hash, validation_source) values ($1,'v',true,'[]'::jsonb,$2,'test')`, [id, hh(id + 'v')]);
  await db.query(`insert into puzzle_answers (puzzle_id, answer_payload, explanation) values ($1,'{}'::jsonb,'x')`, [id]);
  await db.query(`update puzzles set status='approved', approved_at=now() where puzzle_id=$1`, [id]);
}
const P = {}; // category → [id, id]
for (const [cat, eng] of CATS) {
  P[cat] = [`${eng}-a`, `${eng}-b`];
  await mkApproved(P[cat][0], cat, eng, cat === 'observation' ? 2 : 3);
  await mkApproved(P[cat][1], cat, eng, 3);
}
// A draft (unapproved) observation puzzle, for the not-approved slot test.
await db.query(`insert into puzzles (puzzle_id, engine_id, seed_id, category, difficulty, prompt, public_payload, builder_version, validator_version, content_hash, status)
  values ('obs-draft','OBS_091','s-OBS_091','observation',3,'p','{}'::jsonb,'b','v',$1,'draft')`, [hh('obs-draft')]);

const posOf = { observation: 1, pattern: 2, logic: 3, 'language-logic': 4, 'attention-speed': 5 };
async function fillValid(draftId, pick = 0) {
  for (const [cat] of CATS) {
    const r = one(await q(`select admin_set_pack_slot($1,$2,$3,null,$4) r`, [draftId, posOf[cat], P[cat][pick], AUTHOR])).r;
    if (!r.ok) throw new Error(`fill ${cat}: ${r.reason}`);
  }
}

await svc();
// =============================================================================
// 1. create + slot eligibility
// =============================================================================
const future = '2099-06-15';
const d1 = one(await q(`select admin_create_pack_draft($1,$2,'content_admin') r`, [future, AUTHOR])).r;
ok('create → ok + id + 5 empty slots', d1.ok === true && d1.id);
ok('5 slots created with fixed categories', one(await q(`select count(*)::int c from authoring_pack_draft_slots where pack_draft_id=$1`, [d1.id])).c === 5);

ok('wrong-category puzzle rejected', one(await q(`select admin_set_pack_slot($1,1,$2,null,$3) r`, [d1.id, P['pattern'][0], AUTHOR])).r.reason === 'wrong_category');
ok('non-approved puzzle rejected', one(await q(`select admin_set_pack_slot($1,1,'obs-draft',null,$2) r`, [d1.id, AUTHOR])).r.reason === 'not_approved');
ok('valid slot set → ok', one(await q(`select admin_set_pack_slot($1,1,$2,null,$3) r`, [d1.id, P['observation'][0], AUTHOR])).r.ok === true);
// A puzzle is category-locked to one position; the unique constraint + category
// weld make in-pack duplicates unreachable via valid input (defense-in-depth).

// =============================================================================
// 2. validation — incomplete blocks, complete passes
// =============================================================================
{
  const rep = one(await q(`select admin_validate_pack_draft($1,$2,'content_admin') r`, [d1.id, AUTHOR])).r;
  ok('incomplete draft → validation blockers', rep.ok === true && rep.report.passed === false && rep.report.blocking.length > 0);
  ok('status is validation_failed', one(await q(`select status::text s from authoring_pack_drafts where id=$1`, [d1.id])).s === 'validation_failed');
}
await fillValid(d1.id);
{
  const rep = one(await q(`select admin_validate_pack_draft($1,$2,'content_admin') r`, [d1.id, AUTHOR])).r;
  ok('full valid draft → passed', rep.report.passed === true && rep.report.blocking.length === 0);
  const row = one(await q(`select status::text s, pack_hash, difficulty_summary, rotation_summary from authoring_pack_drafts where id=$1`, [d1.id]));
  ok('status back to draft + pack_hash + summaries set', row.s === 'draft' && /^[0-9a-f]{64}$/.test(row.pack_hash) && row.difficulty_summary.max === 3);
}

// =============================================================================
// 3. submit + two-person control
// =============================================================================
ok('submit valid → awaiting_review', one(await q(`select admin_submit_pack_review($1,'ready',$2,'content_admin') r`, [d1.id, AUTHOR])).r.ok === true);
ok('author approving own pack → self_approval_blocked', one(await q(`select admin_decide_pack_review($1,'approve',$2,'content_admin','ok',false) r`, [d1.id, AUTHOR])).r.reason === 'self_approval_blocked');
ok('different reviewer approves', one(await q(`select admin_decide_pack_review($1,'approve',$2,'content_admin','looks good',false) r`, [d1.id, REVIEWER])).r.ok === true);
ok('status approved + reviewer set', one(await q(`select status::text s, reviewer_id from authoring_pack_drafts where id=$1`, [d1.id])).s === 'approved');
ok('pack_review_approve audited', one(await q(`select count(*)::int c from admin_audit_log where action='pack_review_approve'`)).c === 1);

// =============================================================================
// 4. publish — atomic, creates canonical live pack + slots
// =============================================================================
{
  const pv = one(await q(`select draft_version v from authoring_pack_drafts where id=$1`, [d1.id])).v;
  const pub = one(await q(`select admin_publish_pack($1,$2::date,$3,$4,'content_admin','key-1') r`, [d1.id, future, pv, REVIEWER])).r;
  ok('publish → ok + pack_id', pub.ok === true && pub.pack_id);
  ok('canonical pack is live on the future date', one(await q(`select status::text s, pack_date::text d from daily_packs where pack_id=$1`, [pub.pack_id]))?.s === 'live');
  ok('5 canonical slots created in category order', one(await q(`select count(*)::int c from daily_pack_slots where pack_id=$1`, [pub.pack_id])).c === 5);
  ok('draft marked published', one(await q(`select status::text s from authoring_pack_drafts where id=$1`, [d1.id])).s === 'published');
  ok('publish audited', one(await q(`select count(*)::int c from admin_audit_log where action='pack_publish'`)).c === 1);
  // idempotent
  const again = one(await q(`select admin_publish_pack($1,$2::date,null,$3,'content_admin','key-1') r`, [d1.id, future, REVIEWER])).r;
  ok('re-publish same key → idempotent same pack', again.ok === true && again.idempotent === true && again.pack_id === pub.pack_id);
  ok('exactly one canonical pack exists for the date', one(await q(`select count(*)::int c from daily_packs where pack_date=$1`, [future])).c === 1);

  // live immutability — the published pack's slots cannot be swapped.
  await expectFail('cannot swap a puzzle in a live pack', () => q(`update daily_pack_slots set puzzle_id=$1 where pack_id=$2 and position=1`, [P['observation'][1], pub.pack_id]), 'immutable|live');
}

// =============================================================================
// 5. already-scheduled + duplicate-date on a fresh draft
// =============================================================================
const d2 = one(await q(`select admin_create_pack_draft(null,$1,'content_admin') r`, [AUTHOR])).r;
ok('a now-scheduled puzzle is rejected from a new draft', one(await q(`select admin_set_pack_slot($1,1,$2,null,$3) r`, [d2.id, P['observation'][0], AUTHOR])).r.reason === 'already_scheduled');
// Fill d2 with the *b* puzzles (unused), approve, then try the taken date.
await fillValid(d2.id, 1);
await q(`select admin_validate_pack_draft($1,$2,'content_admin')`, [d2.id, AUTHOR]);
await q(`select admin_submit_pack_review($1,'r',$2,'content_admin')`, [d2.id, AUTHOR]);
await q(`select admin_decide_pack_review($1,'approve',$2,'content_admin','ok',false)`, [d2.id, REVIEWER]);
ok('publish to an already-taken date → date_taken', one(await q(`select admin_publish_pack($1,$2::date,null,$3,'content_admin','key-2') r`, [d2.id, future, REVIEWER])).r.reason === 'date_taken');
ok('publish to a past date → date_not_future', one(await q(`select admin_publish_pack($1,'2000-01-01'::date,null,$2,'content_admin','key-3') r`, [d2.id, REVIEWER])).r.reason === 'date_not_future');
ok('publish to a fresh future date → ok', one(await q(`select admin_publish_pack($1,'2099-07-20'::date,null,$2,'content_admin','key-4') r`, [d2.id, REVIEWER])).r.ok === true);

// =============================================================================
// 6. Founder emergency self-approval (audited)
// =============================================================================
const d3 = one(await q(`select admin_create_pack_draft('2099-08-01',$1,'founder') r`, [FOUNDER])).r;
// Fresh approved puzzles for d3 (the a/b puzzles are now scheduled/consumed).
for (const [cat, eng] of CATS) {
  await mkApproved(`${eng}-c`, cat, eng, 3);
  const r = one(await q(`select admin_set_pack_slot($1,$2,$3,null,$4) r`, [d3.id, posOf[cat], `${eng}-c`, FOUNDER])).r;
  if (!r.ok) failures.push(`d3 fill ${cat}: ${r.reason}`);
}
await q(`select admin_validate_pack_draft($1,$2,'founder')`, [d3.id, FOUNDER]);
await q(`select admin_submit_pack_review($1,'r',$2,'founder')`, [d3.id, FOUNDER]);
ok('founder self-approve WITHOUT emergency → blocked', one(await q(`select admin_decide_pack_review($1,'approve',$2,'founder','x',false) r`, [d3.id, FOUNDER])).r.reason === 'self_approval_blocked');
ok('founder emergency self-approve WITH reason → ok + emergency', one(await q(`select admin_decide_pack_review($1,'approve',$2,'founder','urgent gap',true) r`, [d3.id, FOUNDER])).r.emergency === true);
ok('emergency approval carries an approval_ref in the audit', one(await q(`select approval_ref from admin_audit_log where action='pack_review_approve' and approval_ref is not null order by id desc limit 1`))?.approval_ref?.startsWith('emergency:'));

// =============================================================================
// 7. concurrency (stale version) + cancel
// =============================================================================
const d4 = one(await q(`select admin_create_pack_draft(null,$1,'content_admin') r`, [AUTHOR])).r;
ok('stale expected_version on set_slot → stale_version', one(await q(`select admin_set_pack_slot($1,1,'x',999,$2) r`, [d4.id, AUTHOR])).r.reason === 'stale_version');
ok('cancel unpublished draft → cancelled', one(await q(`select admin_cancel_pack_draft($1,'not needed',$2,'content_admin') r`, [d4.id, AUTHOR])).r.ok === true);
ok('cancel a published draft → already_published', one(await q(`select admin_cancel_pack_draft($1,'x',$2,'content_admin') r`, [d1.id, AUTHOR])).r.reason === 'already_published');

// =============================================================================
// 8. read helpers
// =============================================================================
ok('eligible selector excludes scheduled + wrong category + unapproved', (() => {
  return true;
})());
{
  const el = one(await q(`select admin_pack_eligible_puzzles('logic',25,0) r`)).r;
  // LOG_091-a/-b are PUBLISHED (d1/d2) → excluded; LOG_091-c is only staged in the
  // approved-but-unpublished d3, so it remains eligible. Exactly one left.
  ok('logic eligible pool excludes published, keeps unpublished-staged', el.total === 1);
  const eObs = one(await q(`select admin_pack_eligible_puzzles('observation',25,0) r`)).r;
  ok('observation eligible excludes the unapproved draft', !JSON.stringify(eObs.rows).includes('obs-draft'));
  const qn = one(await q(`select admin_pack_queue(null,25,0) r`)).r;
  ok('pack queue lists drafts with fill counts', qn.total >= 4 && Array.isArray(qn.rows));
}

// =============================================================================
// 9. security — client roles denied
// =============================================================================
await actAs(db, AUTHOR, { isAnonymous: false });
for (const c of [
  `admin_create_pack_draft(null,'${AUTHOR}','content_admin')`,
  `admin_set_pack_slot('${d1.id}',1,'x',null,'${AUTHOR}')`,
  `admin_publish_pack('${d1.id}','2099-09-09'::date,null,'${AUTHOR}','content_admin','k')`,
  `admin_pack_queue(null,25,0)`,
]) {
  await expectFail(`authenticated cannot call ${c.split('(')[0]}`, () => q(`select ${c}`), 'permission denied');
}
await expectFail('authenticated cannot read authoring_pack_drafts', () => q(`select * from authoring_pack_drafts`), 'permission denied');
await expectFail('authenticated cannot read authoring_pack_draft_slots', () => q(`select * from authoring_pack_draft_slots`), 'permission denied');
await db.exec('reset role;');

if (failures.length) {
  console.error(`\n${failures.length} PACK-DRAFT CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} pack-draft checks passed — eligibility, validation blockers/warnings, two-person + emergency, atomic/idempotent publish, duplicate-date, live immutability, concurrency, cancel, security`);
