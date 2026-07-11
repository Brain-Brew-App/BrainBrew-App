/**
 * Database schema tests — `npm run db:test`.
 *
 * Applies the ACTUAL committed migrations into an in-process Postgres (PGlite,
 * no Docker) and exercises the schema: constraints, integrity triggers, the
 * public/private boundary, and RLS/grants under the real `anon` and
 * `service_role` roles. Every important rule is mutation-tested — a mutation
 * that should be rejected is run and asserted to fail for the intended reason.
 *
 * This does not touch the remote project. It proves the migrations are correct
 * before anyone applies them.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { PGlite } from '@electric-sql/pglite';

import { AUTH_MOCK } from './pglite-harness.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

let passed = 0;
const failures = [];
const ok = (name, cond) => (cond ? passed++ : failures.push(name));

/** Runs SQL and asserts it throws, optionally matching a message fragment. */
async function expectFail(db, name, sql, matcher) {
  try {
    await db.exec(sql);
    failures.push(`${name} — expected a rejection, but it succeeded`);
  } catch (e) {
    if (matcher && !new RegExp(matcher, 'i').test(e.message)) {
      failures.push(`${name} — rejected, but for the wrong reason: ${e.message.split('\n')[0]}`);
    } else {
      passed++;
    }
  }
}

/** Runs SQL and asserts it succeeds. */
async function expectOk(db, name, sql) {
  try {
    await db.exec(sql);
    passed++;
  } catch (e) {
    failures.push(`${name} — expected success, got: ${e.message.split('\n')[0]}`);
  }
}

const db = new PGlite();

// Supabase platform roles, created before the migrations grant to them.
// service_role carries BYPASSRLS in production — mirror that, or its reads would
// be (wrongly) denied by RLS here and the test would not reflect reality.
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
`);

// Pin the session to UTC so `current_date` equals the UTC date the public RPC
// filters on. Without this, near a UTC/local midnight boundary the test could
// publish a pack to a local `current_date` one day ahead of the UTC date the
// RPC compares against, and the "anon sees the live pack" check would flake.
await db.exec(`set time zone 'UTC';`);

// The auth-schema stand-in (Supabase provides it in production), so the profile
// and attempt-ownership migrations apply and RLS is testable.
await db.exec(AUTH_MOCK);

// Apply every committed migration, in filename order.
for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  } catch (e) {
    console.error(`\nMigration ${file} failed to apply:\n  ${e.message}\n`);
    process.exit(1);
  }
}
passed++; // migrations applied

// A minimal valid fixture: one engine + puzzle per category, and one full pack.
const CATS = [
  ['OBS_001', 'observation', 1],
  ['PAT_001', 'pattern', 2],
  ['LOG_001', 'logic', 3],
  ['LNG_001', 'language-logic', 4],
  ['ATT_001', 'attention-speed', 5],
];
const H = 'a'.repeat(64); // a well-formed sha256 placeholder

for (const [eng, cat] of CATS) {
  await db.exec(`
    insert into puzzle_engines (engine_id, category, name, build_status, min_difficulty, max_difficulty,
      weekly_cap, min_days_between, estimated_time_ms, ui_component, builder_id, validator_id, scoring_id,
      explanation_strategy)
    values ('${eng}', '${cat}', '${eng} name', 'built', 1, 5, 3, 2, 20000,
      'SomeEngine', 'someBuilder', 'someValidator', 'someScoring', 'template');
    insert into puzzle_seeds (seed_id, engine_id, payload, authored_difficulty, source_type, status, content_hash)
    values ('${eng}-seed', '${eng}', '{"k":1}', 2, 'human', 'approved', '${H}');
    insert into puzzles (puzzle_id, engine_id, seed_id, category, difficulty, prompt, public_payload,
      builder_version, validator_version, content_hash, status)
    values ('${eng}-pz', '${eng}', '${eng}-seed', '${cat}', 2, 'Prompt?', '{"render":true}',
      'b1', 'v1', '${H}', 'draft');
    insert into puzzle_answers (puzzle_id, answer_payload, explanation)
    values ('${eng}-pz', '{"answer":"x"}', 'Because of the rule.');
    insert into puzzle_validation_results (puzzle_id, validator_version, passed, validation_hash, validation_source)
    values ('${eng}-pz', 'v1', true, '${H}', 'local');
    update puzzles set status = 'approved', approved_at = now() where puzzle_id = '${eng}-pz';
  `);
  // A spare approved puzzle per category, scheduled into no pack — used by the
  // negative tests so they don't collide with the puzzle_scheduled_once rule.
  await db.exec(`
    insert into puzzle_seeds (seed_id, engine_id, payload, authored_difficulty, source_type, status, content_hash)
    values ('${eng}-spare-seed', '${eng}', '{"k":2}', 2, 'human', 'approved', '${H}');
    insert into puzzles (puzzle_id, engine_id, seed_id, category, difficulty, prompt, public_payload,
      builder_version, validator_version, content_hash, status)
    values ('${eng}-spare', '${eng}', '${eng}-spare-seed', '${cat}', 2, 'Prompt?', '{"render":true}',
      'b1', 'v1', '${H}', 'draft');
    insert into puzzle_answers (puzzle_id, answer_payload, explanation)
    values ('${eng}-spare', '{"answer":"y"}', 'Because of the rule.');
    insert into puzzle_validation_results (puzzle_id, validator_version, passed, validation_hash, validation_source)
    values ('${eng}-spare', 'v1', true, '${H}', 'local');
    update puzzles set status = 'approved', approved_at = now() where puzzle_id = '${eng}-spare';
  `);
}
passed++; // fixture engines/puzzles built and approved (with spares)

// A draft pack with all five slots, then promoted to approved.
await db.exec(`
  insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label)
  values ('pack-01', 0, 'draft', '${H}', 'standard');
`);
for (const [eng, cat, pos] of CATS) {
  await db.exec(`
    insert into daily_pack_slots (pack_id, position, category, puzzle_id, engine_id)
    values ('pack-01', ${pos}, '${cat}', '${eng}-pz', '${eng}');
  `);
}
await expectOk(db, 'pack with five ordered slots can be approved',
  `update daily_packs set status = 'approved' where pack_id = 'pack-01';`);

// =============================================================================
// Constraint & trigger mutation tests
// =============================================================================

await expectFail(db, 'engine id must match format',
  `insert into puzzle_engines (engine_id, category, name, min_difficulty, max_difficulty, weekly_cap,
    min_days_between, estimated_time_ms, ui_component, builder_id, validator_id, scoring_id, explanation_strategy)
   values ('bad-id', 'logic', 'x', 1, 2, 3, 2, 1, 'E', 'b', 'v', 's', 't');`, 'engine_id_format');

await expectFail(db, 'ui_component must be an identifier, not arbitrary code',
  `insert into puzzle_engines (engine_id, category, name, min_difficulty, max_difficulty, weekly_cap,
    min_days_between, estimated_time_ms, ui_component, builder_id, validator_id, scoring_id, explanation_strategy)
   values ('LOG_009', 'logic', 'x', 1, 2, 3, 2, 1, 'drop table;', 'b', 'v', 's', 't');`, 'ui_component_ident');

await expectFail(db, 'content hash must be sha256 hex',
  `update puzzles set content_hash = 'not-a-hash' where puzzle_id = 'OBS_001-pz';`, 'puzzle_hash_sha256');

await expectFail(db, 'puzzle category must match its engine',
  `update puzzles set category = 'pattern' where puzzle_id = 'OBS_001-pz';`, 'does not match engine');

await expectFail(db, 'a puzzle cannot be approved without passing validation',
  `insert into puzzle_engines (engine_id, category, name, min_difficulty, max_difficulty, weekly_cap,
     min_days_between, estimated_time_ms, ui_component, builder_id, validator_id, scoring_id, explanation_strategy)
     values ('LOG_008', 'logic', 'x', 1, 5, 3, 2, 1, 'E', 'b', 'v', 's', 't');
   insert into puzzle_seeds (seed_id, engine_id, payload, authored_difficulty, source_type, content_hash)
     values ('unvalidated-seed', 'LOG_008', '{}', 2, 'human', '${H}');
   insert into puzzles (puzzle_id, engine_id, seed_id, category, difficulty, prompt, public_payload,
     builder_version, validator_version, content_hash, status, approved_at)
     values ('unvalidated-pz', 'LOG_008', 'unvalidated-seed', 'logic', 2, 'P?', '{}', 'b', 'v', '${H}', 'approved', now());`,
  'no passing validation');

await expectFail(db, 'a slot cannot carry a non-approved puzzle',
  `insert into puzzle_seeds (seed_id, engine_id, payload, authored_difficulty, source_type, content_hash)
     values ('draft-seed', 'LOG_001', '{}', 2, 'human', '${H}');
   insert into puzzles (puzzle_id, engine_id, seed_id, category, difficulty, prompt, public_payload,
     builder_version, validator_version, content_hash, status)
     values ('draft-pz', 'LOG_001', 'draft-seed', 'logic', 2, 'P?', '{}', 'b', 'v', '${H}', 'draft');
   insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label)
     values ('pack-draft', 9, 'draft', '${H}', 'standard');
   insert into daily_pack_slots (pack_id, position, category, puzzle_id, engine_id)
     values ('pack-draft', 3, 'logic', 'draft-pz', 'LOG_001');`,
  'only approved puzzles');

await expectFail(db, 'slot position/category order is fixed',
  `insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label)
     values ('pack-order', 8, 'draft', '${H}', 'standard');
   insert into daily_pack_slots (pack_id, position, category, puzzle_id, engine_id)
     values ('pack-order', 1, 'pattern', 'PAT_001-spare', 'PAT_001');`,
  'position_category_order');

await expectFail(db, 'a pack cannot be approved with only four slots',
  `insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label)
     values ('pack-short', 7, 'draft', '${H}', 'standard');
   insert into daily_pack_slots (pack_id, position, category, puzzle_id, engine_id) values
     ('pack-short', 1, 'observation', 'OBS_001-spare', 'OBS_001');
   update daily_packs set status = 'approved' where pack_id = 'pack-short';`,
  'needs exactly 5');

// The no-repeat invariant: a puzzle scheduled into a second pack.
await expectFail(db, 'a puzzle cannot be scheduled into more than one pack',
  `insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label)
     values ('pack-dup', 6, 'draft', '${H}', 'standard');
   insert into daily_pack_slots (pack_id, position, category, puzzle_id, engine_id)
     values ('pack-dup', 1, 'observation', 'OBS_001-pz', 'OBS_001');`,
  'puzzle_scheduled_once');

// --- Publication (publish_pack) ---
await expectFail(db, 'publishing a non-existent pack fails',
  `select publish_pack('pack-nope', current_date);`, 'does not exist');

await expectOk(db, 'an approved pack can be published to today',
  `select publish_pack('pack-01', current_date);`);
await expectOk(db, 'publishing the same pack to the same date is idempotent',
  `select publish_pack('pack-01', current_date);`);
await expectFail(db, 'a live pack cannot be moved to a different date',
  `select publish_pack('pack-01', current_date + 1);`, 'cannot be moved');

// A second approved pack cannot claim a date already owned.
await db.exec(`
  insert into daily_packs (pack_id, pack_index, status, content_hash, difficulty_label)
    values ('pack-02', 1, 'draft', '${H}', 'standard');
`);
for (const [eng, cat, pos] of CATS) {
  await db.exec(`insert into daily_pack_slots (pack_id, position, category, puzzle_id, engine_id)
    values ('pack-02', ${pos}, '${cat}', '${eng}-spare', '${eng}');`);
}
await db.exec(`update daily_packs set status = 'approved' where pack_id = 'pack-02';`);
await expectFail(db, 'a date already owned by another pack is refused',
  `select publish_pack('pack-02', current_date);`, 'already owned');
await expectOk(db, 'a different date can be published', `select publish_pack('pack-02', current_date - 1);`);

await expectFail(db, 'a live pack slot cannot be re-pointed at another puzzle',
  `update daily_pack_slots set puzzle_id = 'PAT_001-spare'
   where pack_id = 'pack-01' and position = 2;`, 'immutable');

await expectFail(db, 'a live pack slot max_score cannot be changed',
  `update daily_pack_slots set max_score = 10 where pack_id = 'pack-01' and position = 1;`, 'immutable');

await expectFail(db, 'no slot can be deleted from a live pack',
  `delete from daily_pack_slots where pack_id = 'pack-01' and position = 5;`, 'no slot may be removed');

await expectFail(db, 'no slot can be added to a live pack',
  `insert into daily_pack_slots (pack_id, position, category, puzzle_id, engine_id)
   values ('pack-01', 5, 'attention-speed', 'ATT_001-pz', 'ATT_001');`, 'unique|no slot may be added');

// Voiding is allowed (removes from scoring) and keeps the same puzzle.
await expectOk(db, 'a live pack slot may be voided (same puzzle)',
  `update daily_pack_slots set void_status = true, void_reason = 'ambiguous', voided_at = now()
   where pack_id = 'pack-01' and position = 3;`);

await expectFail(db, 'a voided slot cannot be un-voided',
  `update daily_pack_slots set void_status = false, void_reason = null, voided_at = null
   where pack_id = 'pack-01' and position = 3;`, 'cannot be un-voided');

// =============================================================================
// RLS / grants under the real roles
// =============================================================================

// Build a public, past-dated LIVE pack so the view has something to return, and
// prove it exposes no answer. (pack-01 is live+today; use it.)
async function asRole(role, fn) {
  await db.exec(`set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}

// anon cannot read the private answer table…
await asRole('anon', async () => {
  await expectFail(db, 'anon cannot read puzzle_answers',
    `select * from puzzle_answers limit 1;`, 'permission denied');
  await expectFail(db, 'anon cannot read puzzle_seeds',
    `select * from puzzle_seeds limit 1;`, 'permission denied');
  await expectFail(db, 'anon cannot read content_reviews',
    `select * from content_reviews limit 1;`, 'permission denied');
  await expectFail(db, 'anon cannot read the puzzles base table',
    `select * from puzzles limit 1;`, 'permission denied');
  await expectFail(db, 'anon cannot write puzzles',
    `insert into puzzles (puzzle_id, engine_id, seed_id, category, difficulty, prompt, public_payload,
      builder_version, validator_version, content_hash) values
      ('hack','OBS_001','OBS_001-seed','observation',1,'p','{}','b','v','${H}');`, 'permission denied');
});
passed++; // anon denial block completed

// anon cannot touch the attempts tables directly (function-only)…
await asRole('anon', async () => {
  await expectFail(db, 'anon cannot read attempts', `select * from attempts limit 1;`, 'permission denied');
  await expectFail(db, 'anon cannot write attempts',
    `insert into attempts (session_id, pack_id) values ('sessionsessionse', 'pack-01');`, 'permission denied');
  await expectFail(db, 'anon cannot read attempt_items', `select * from attempt_items limit 1;`, 'permission denied');
});
passed++;

// …but CAN call the sanitized public RPC, which has no answer column by shape.
// pack-01 is live + today, with position 3 voided → 4 visible slots.
const rpcRows = await asRole('anon', async () =>
  (await db.query(`select * from get_public_pack(current_date) order by position;`)).rows,
);
ok('anon sees the live pack via the RPC', rpcRows.length === 4);
ok('the voided slot is hidden from the public RPC', !rpcRows.some((r) => r.position === 3));
ok('RPC rows carry no answer field', rpcRows.every((r) => !('answer_payload' in r) && !('explanation' in r)));
ok('RPC rows carry the render fields', rpcRows.every((r) => 'public_payload' in r && 'prompt' in r));

// A future date returns nothing, even to the RPC.
const futureRows = await asRole('anon', async () =>
  (await db.query(`select count(*)::int c from get_public_pack(current_date + 30);`)).rows[0].c,
);
ok('a future date returns nothing from the RPC', futureRows === 0);

// The RPC's declared columns contain no answer/explanation.
const rpcCols = (
  await db.query(`select unnest(proargnames) as n from pg_proc where proname = 'get_public_pack'`)
).rows.map((r) => r.n);
ok('the RPC exposes no answer_payload or explanation column', !rpcCols.includes('answer_payload') && !rpcCols.includes('explanation'));

// --- Attempts: server-authoritative invariants (as service_role) ---
await asRole('service_role', async () => {
  await db.query(
    `insert into attempts (id, session_id, pack_id) values ('11111111-1111-1111-1111-111111111111', 'sessionsessionse', 'pack-01');`,
  );
  // Open the (non-void) slot at position 1.
  const slot1 = (await db.query(`select id from daily_pack_slots where pack_id='pack-01' and position=1`)).rows[0].id;
  await db.query(
    `insert into attempt_items (attempt_id, slot_id, position) values ('11111111-1111-1111-1111-111111111111', $1, 1)`,
    [slot1],
  );
});
passed++;

// A voided slot cannot be opened for an attempt.
const voidSlot = (await db.query(`select id from daily_pack_slots where pack_id='pack-01' and position=3`)).rows[0].id;
await expectFail(db, 'a voided slot cannot be opened for an attempt',
  `insert into attempt_items (attempt_id, slot_id, position)
   values ('11111111-1111-1111-1111-111111111111', '${voidSlot}', 3);`, 'voided');

// Submit the opened item, then prove it is immutable and non-duplicable.
const item1 = (await db.query(`select id from attempt_items where attempt_id='11111111-1111-1111-1111-111111111111' and position=1`)).rows[0].id;
await expectOk(db, 'an opened item can be submitted and scored',
  `update attempt_items set status='submitted', submitted_at=now(), answer_payload='{"a":1}',
     awarded_score=20, verdict='correct' where id='${item1}';`);
await expectFail(db, 'a submitted item cannot be re-scored',
  `update attempt_items set awarded_score=0 where id='${item1}';`, 'already submitted');
await expectFail(db, 'a submitted item cannot revert to opened',
  `update attempt_items set status='opened' where id='${item1}';`, 'cannot revert');
await expectFail(db, 'a second item for the same slot is rejected',
  `insert into attempt_items (attempt_id, slot_id, position)
   values ('11111111-1111-1111-1111-111111111111', (select id from daily_pack_slots where pack_id='pack-01' and position=1), 1);`,
  'one_item_per_slot');

// Complete the attempt, then prove it is terminal.
await expectOk(db, 'an attempt can be completed with a final score',
  `update attempts set status='completed', final_score=88, completed_at=now() where id='11111111-1111-1111-1111-111111111111';`);
await expectFail(db, 'a completed attempt cannot be reopened',
  `update attempts set status='active' where id='11111111-1111-1111-1111-111111111111';`, 'cannot be reopened');
await expectFail(db, 'a completed attempt score is final',
  `update attempts set final_score=100 where id='11111111-1111-1111-1111-111111111111';`, 'score is final');
await expectFail(db, 'no item can be opened on a completed attempt',
  `insert into attempt_items (attempt_id, slot_id, position)
   values ('11111111-1111-1111-1111-111111111111', (select id from daily_pack_slots where pack_id='pack-01' and position=4), 4);`,
  'no further items');

// service_role bypasses RLS and can read the answer key (privileged path).
const svcCanRead = await asRole('service_role', async () =>
  (await db.query(`select count(*)::int c from puzzle_answers;`)).rows[0].c,
);
ok('service_role can read answers (privileged path works)', svcCanRead === 10);

// =============================================================================

if (failures.length) {
  console.error(`\n${failures.length} DB CHECK(S) FAILED:\n`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} database checks passed (schema, constraints, triggers, RLS, grants)`);
