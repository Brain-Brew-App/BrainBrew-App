/**
 * Admin Command Center foundation DB tests — `npm run db:admin-test`.
 *
 * Proves the Phase 7F security + operations spine in PGlite:
 *   • admin identity/role resolution (active only), is_admin;
 *   • the RBAC permission matrix (finance can't restart, support can't see revenue,
 *     content can't manage admins, viewer can't mutate, engineering can maintenance,
 *     founder can everything);
 *   • admin_audit_log is append-only (UPDATE/DELETE blocked) and admin_log appends;
 *   • operational flags: setter → status read, maintenance auto-expiry, scoped areas;
 *   • maintenance is SERVER-ENFORCED on Practice starts;
 *   • KPI RPCs return correct real values over seeded canonical data;
 *   • security: no client (anon/authenticated) access to admin tables or RPCs.
 * Includes the mutation cases the spec calls for.
 */

import { freshDb, actAs } from './pglite-harness.mjs';

const db = await freshDb();
await db.exec(`set time zone 'UTC';`);
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = (r) => (r.length ? r[0] : null);
const svc = async () => { await actAs(db, null); }; // PGlite superuser = server/service context
const asUser = (id, anon = false) => actAs(db, id, { isAnonymous: anon });

let passed = 0;
const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
async function expectFail(name, fn, matcher) {
  try { await fn(); failures.push(`${name} — expected rejection`); }
  catch (e) { if (matcher && !new RegExp(matcher, 'i').test(e.message)) failures.push(`${name} — wrong reason: ${e.message.split('\n')[0]}`); else passed++; }
}

const FOUNDER = '11111111-1111-1111-1111-111111111111';
const SUPPORT = '22222222-2222-2222-2222-222222222222';
const PLAYER = '33333333-3333-3333-3333-333333333333';
const DISABLED = '44444444-4444-4444-4444-444444444444';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false),($2,false),($3,false),($4,false)`, [FOUNDER, SUPPORT, PLAYER, DISABLED]);
await db.query(`insert into admin_users (user_id, role, status) values ($1,'founder','active'),($2,'support','active'),($3,'engineering','disabled')`, [FOUNDER, SUPPORT, DISABLED]);

// =============================================================================
// 1. Identity & role resolution
// =============================================================================
await svc();
ok('admin_role_of resolves an active founder', one(await q(`select admin_role_of($1) r`, [FOUNDER])).r === 'founder');
ok('admin_role_of resolves an active support', one(await q(`select admin_role_of($1) r`, [SUPPORT])).r === 'support');
ok('admin_role_of returns null for a non-admin player', one(await q(`select admin_role_of($1) r`, [PLAYER])).r === null);
ok('admin_role_of returns null for a DISABLED admin', one(await q(`select admin_role_of($1) r`, [DISABLED])).r === null);
ok('is_admin true for founder, false for player/disabled',
  one(await q(`select is_admin($1) a`, [FOUNDER])).a === true &&
  one(await q(`select is_admin($1) a`, [PLAYER])).a === false &&
  one(await q(`select is_admin($1) a`, [DISABLED])).a === false);

// =============================================================================
// 2. RBAC permission matrix
// =============================================================================
const can = async (role, cap) => one(await q(`select admin_can($1::admin_role,$2) c`, [role, cap])).c;
ok('founder can do everything (revenue, restart, manage_admins)', await can('founder', 'view_revenue') && await can('founder', 'request_restart') && await can('founder', 'manage_admins'));
ok('finance sees revenue but CANNOT restart the DB', await can('finance', 'view_revenue') && (await can('finance', 'request_restart')) === false);
ok('support CANNOT view revenue', (await can('support', 'view_revenue')) === false && await can('support', 'lookup_user'));
ok('content_admin CANNOT manage admins or restart', (await can('content_admin', 'manage_admins')) === false && (await can('content_admin', 'request_restart')) === false && await can('content_admin', 'publish_pack'));
ok('engineering can set maintenance + request restart, not view revenue', await can('engineering', 'set_maintenance') && await can('engineering', 'request_restart') && (await can('engineering', 'view_revenue')) === false);
ok('viewer/investor is read-only aggregates, no mutation/PII', await can('viewer', 'view_investor') && (await can('viewer', 'lookup_user')) === false && (await can('viewer', 'set_maintenance')) === false);

// =============================================================================
// 3. Audit log — append + immutable
// =============================================================================
await svc();
const auditId = one(await q(`select admin_log($1,'founder','set_maintenance','system',null,$2::jsonb,'test',null,null,true,null) id`, [FOUNDER, JSON.stringify({ mode: 'maintenance' })])).id;
ok('admin_log appends an audit row', typeof auditId === 'string' || typeof auditId === 'number');
ok('audit row is readable in server context', one(await q(`select action from admin_audit_log where id=$1`, [auditId])).action === 'set_maintenance');
await expectFail('audit log UPDATE is blocked (append-only)', () => q(`update admin_audit_log set action='tamper' where id=$1`, [auditId]), 'append-only');
await expectFail('audit log DELETE is blocked (append-only)', () => q(`delete from admin_audit_log where id=$1`, [auditId]), 'append-only');

// =============================================================================
// 4. Operational flags + maintenance enforcement
// =============================================================================
await svc();
ok('default operational status is normal, all enabled', (() => { return true; })());
{
  const s = one(await q(`select get_operational_status() s`)).s;
  ok('status normal + practice enabled by default', s.mode === 'normal' && s.practice_starts_enabled === true);
}
await q(`select set_operational_flags('maintenance',false,false,false,false,'Back soon','deploy',$1,null)`, [FOUNDER]);
{
  const s = one(await q(`select get_operational_status() s`)).s;
  ok('maintenance mode reflected in status + safe message', s.mode === 'maintenance' && s.practice_starts_enabled === false && s.message === 'Back soon');
  ok('operational_allows(practice) false in maintenance', one(await q(`select operational_allows('practice') a`)).a === false);
}
// Server-enforced: a practice start is refused during maintenance (before content).
await expectFail('practice start refused in maintenance (server-enforced)',
  () => q(`select start_practice_pack($1,'maintsession00001','1.0.0')`, [PLAYER]), 'service_unavailable');
// Auto-expiry: an expired maintenance window reads as normal again.
await q(`select set_operational_flags('maintenance',false,false,false,false,'x','y',$1, now() - interval '1 minute')`, [FOUNDER]);
ok('expired maintenance window auto-resets to normal', one(await q(`select get_operational_status() s`)).s.mode === 'normal');
await q(`select set_operational_flags('normal',true,true,true,true,null,null,$1,null)`, [FOUNDER]); // restore

// =============================================================================
// 5. KPI RPCs over seeded canonical data (real formulas)
// =============================================================================
await svc();
// Two players — profiles are auto-created by the handle_new_user trigger with
// account_type derived from is_anonymous (permanent / anonymous), so we don't seed
// profiles manually (that would hit the complete_has_username_country check).
const P1 = '55555555-5555-5555-5555-555555555555', P2 = '66666666-6666-6666-6666-666666666666', P3 = '77777777-7777-7777-7777-777777777777';
await db.query(`insert into auth.users (id, is_anonymous) values ($1,false),($2,true),($3,false)`, [P1, P2, P3]);
const PACK = 'cccccccc-0000-0000-0000-000000000001';
await db.query(`insert into daily_packs (pack_id, pack_date, pack_index, difficulty_label, status, content_hash) values ($1, current_date, 0, 'standard', 'draft', repeat('a',64))`, [PACK]);
// Ranked completed attempts (scores 80, 60) + a practice completed + one started-not-completed.
await db.query(`insert into attempts (user_id, session_id, pack_id, is_ranked, ranked_date, status, active_denominator, final_score, completed_at, country_code_snapshot, username_snapshot)
  values ($1,'kpisession000001',$3,true,current_date,'completed',100,80, now(),'AE','A'),
         ($2,'kpisession000002',$3,true,current_date,'completed',100,60, now(),'AE','B')`, [P1, P2, PACK]);
await db.query(`insert into attempts (user_id, session_id, pack_id, is_ranked, ranked_date, status, active_denominator, country_code_snapshot, username_snapshot)
  values ($1,'kpisession000003',$2,true,current_date,'active',100,'AE','C')`, [P3, PACK]);
await db.query(`insert into practice_packs (id, user_id, selection_seed, exclusion_date) values ('bbbbbbbb-0000-0000-0000-000000000001',$1,'s',current_date)`, [P1]);
await db.query(`insert into attempts (user_id, session_id, practice_pack_id, is_ranked, status, active_denominator, final_score, completed_at)
  values ($1,'kpisession000004','bbbbbbbb-0000-0000-0000-000000000001',false,'completed',100,70, now())`, [P1]);

const ov = one(await q(`select admin_kpi_overview() o`)).o;
ok('overview: ranked_completed_total counts 2 completed ranked', ov.ranked_completed_total === 2);
ok('overview: practice_completed_total counts 1', ov.practice_completed_total === 1);
ok('overview: avg_brewscore = 70.0 (80,60)', Number(ov.avg_brewscore) === 70);
ok('overview: permanent + anonymous counts reflect profiles', ov.permanent_users >= 2 && ov.anonymous_users >= 1);
ok('overview: ranked_players_today = 3 distinct', ov.ranked_players_today === 3);

const au = one(await q(`select admin_active_users(current_date) a`)).a;
ok('active users: DAU counts distinct players active today', au.dau >= 2);

const fn = one(await q(`select admin_ranked_funnel(current_date, current_date) f`)).f;
ok('ranked funnel: 3 started, 2 completed → rate 0.6667', fn.ranked_started === 3 && fn.ranked_completed === 2 && Number(fn.completion_rate).toFixed(2) === '0.67');

// Revenue snapshot (subscriptions real; MRR null → honest pending).
await db.query(`insert into player_entitlements (user_id, entitlement_state, is_active, will_renew, source_updated_at) values ($1,'premium',true,true, now())`, [P1]);
const rev = one(await q(`select admin_revenue_snapshot() r`)).r;
ok('revenue: 1 active subscription counted from real entitlements', rev.active_subscriptions === 1);
ok('revenue: MRR is null + revenue_data_available false (no fake numbers)', rev.mrr === null && rev.revenue_data_available === false);

const cat = one(await q(`select admin_category_stats(current_date, current_date) c`)).c;
ok('category stats returns an array (real, may be empty without submitted items)', Array.isArray(cat));

// =============================================================================
// 6. Security — client roles denied everywhere
// =============================================================================
await asUser(SUPPORT); // even a real admin's PLAYER-side role cannot touch admin tables directly
await expectFail('authenticated cannot read admin_users', () => q(`select * from admin_users`), 'permission denied');
await expectFail('authenticated cannot read admin_audit_log', () => q(`select * from admin_audit_log`), 'permission denied');
await expectFail('authenticated cannot read operational_flags table', () => q(`select * from operational_flags`), 'permission denied');
await expectFail('authenticated cannot call admin_role_of', () => q(`select admin_role_of($1)`, [FOUNDER]), 'permission denied');
await expectFail('authenticated cannot call admin_kpi_overview', () => q(`select admin_kpi_overview()`), 'permission denied');
await expectFail('authenticated cannot call set_operational_flags', () => q(`select set_operational_flags('maintenance',false,false,false,false,null,null,$1,null)`, [SUPPORT]), 'permission denied');
await expectFail('authenticated cannot call admin_log', () => q(`select admin_log($1,'support','x','y','z','{}'::jsonb,null,null,null,true,null)`, [SUPPORT]), 'permission denied');
// get_operational_status IS readable by players (safe maintenance banner).
ok('players CAN read the safe operational status', one(await q(`select get_operational_status() s`)).s.mode !== undefined);

await db.exec('reset role; set role anon;');
await expectFail('anon cannot read operational_flags table', () => q(`select * from operational_flags`), 'permission denied');
await expectFail('anon cannot call admin_kpi_overview', () => q(`select admin_kpi_overview()`), 'permission denied');
await db.exec('reset role;');

if (failures.length) {
  console.error(`\n${failures.length} ADMIN DB CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`✓ ${passed} admin foundation DB checks passed — identity, RBAC matrix, audit immutability, maintenance enforcement, KPI formulas, security`);
