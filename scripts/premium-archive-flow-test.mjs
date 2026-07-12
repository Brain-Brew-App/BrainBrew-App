/**
 * Premium + Archives end-to-end MOCKED flows — `npm run test:premium-archive-flow`.
 *
 * Drives the real state machine + ArchiveService (with a mock transport) through
 * the full journeys from Part K/27, proving the device-independent orchestration:
 * purchase→server-confirm→unlock, restore→unlock, archive session, account-switch
 * isolation, and expiration-blocks-new-start. No device, no network.
 */

import { compilePureModules } from './compile.mjs';
import { rmSync } from 'node:fs';

const { load, out } = compilePureModules();
const M = await load('cloud/revenuecat/premiumMachine.js');
const S = await load('cloud/revenuecat/serverSync.js');
const AS = await load('cloud/archive/archiveService.js');

let passed = 0; const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
const run = (events, ctx0) => events.reduce((c, e) => M.reduce(c, e), ctx0 ?? M.initialContext());

const PAST = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

// A mock transport whose "premium/locked" behavior + provider sync are scriptable.
function mockTransport({ premium }) {
  return {
    async rpc(name) {
      if (name === 'get_archive_calendar') return { data: { locked: !premium(), total: premium() ? 1 : 0, dates: premium() ? [{ ranked_date: PAST, difficulty_label: 'standard', incident: false, available: true }] : [] }, error: null };
      if (name === 'get_archive_pack') {
        if (!premium()) return { data: null, error: { message: 'archive_locked' } };
        return { data: { ranked_date: PAST, difficulty_label: 'standard', slots: [1, 2, 3, 4, 5].map((p) => ({ position: p, category: ['observation', 'pattern', 'logic', 'language-logic', 'attention-speed'][p - 1], engine_id: 'E', puzzle_id: `p${p}`, public_payload: { prompt: 'q' }, voided: false })) }, error: null };
      }
      return { data: null, error: null };
    },
    async invoke(fn) {
      if (fn === 'start-archive-attempt') {
        if (!premium()) return { data: null, error: { message: 'archive_locked' } };
        return { data: { attempt_id: 'arch-1', ranked_date: PAST, resumed: false }, error: null };
      }
      return { data: null, error: null };
    },
  };
}

// ── Flow 1: purchase → SDK success → finalizing → SERVER confirms → unlock ────
{
  let ctx = run([{ type: 'START', supported: true }, { type: 'ENTITLEMENT_LOADED', isPremium: false }, { type: 'OFFERING_LOADED', offering: { offeringId: 'default', packages: [] } }]);
  ctx = run([{ type: 'PURCHASE_START' }, { type: 'PURCHASE_RESULT', outcome: { status: 'purchased' } }], ctx);
  ok('purchase: finalizing (server not yet confirmed)', ctx.state === 'finalizing' && !M.premiumUnlocked(ctx));
  // bounded sync loop: server not premium for 2 polls, then premium
  let serverPremium = false; let attempt = 0; let decision;
  const serverStates = [false, false, true];
  do { serverPremium = serverStates[Math.min(attempt, serverStates.length - 1)]; decision = S.decideSync(serverPremium, attempt); attempt++; } while (decision === 'continue' && attempt < 10);
  ok('purchase: sync loop resolves to confirmed', decision === 'confirmed');
  ctx = run([{ type: 'SYNC_CONFIRMED' }], ctx);
  ok('purchase: unlocked ONLY after server confirm', M.premiumUnlocked(ctx) === true);
}

// ── Flow 2: restore → server confirm → unlock ────────────────────────────────
{
  let ctx = run([{ type: 'START', supported: true }, { type: 'ENTITLEMENT_LOADED', isPremium: false }, { type: 'OFFERING_LOADED', offering: { offeringId: 'default', packages: [] } }]);
  ctx = run([{ type: 'RESTORE_START' }, { type: 'RESTORE_RESULT', outcome: { status: 'restored' } }, { type: 'SYNC_CONFIRMED' }], ctx);
  ok('restore: unlocked after server confirm', M.premiumUnlocked(ctx) === true);
  let ctx2 = run([{ type: 'START', supported: true }, { type: 'ENTITLEMENT_LOADED', isPremium: false }, { type: 'OFFERING_LOADED', offering: { offeringId: 'default', packages: [] } }]);
  ctx2 = run([{ type: 'RESTORE_START' }, { type: 'RESTORE_RESULT', outcome: { status: 'nothing_to_restore' } }], ctx2);
  ok('restore: nothing_to_restore stays free', ctx2.state === 'nothing_to_restore' && !M.premiumUnlocked(ctx2));
}

// ── Flow 3: archive session (premium) via the service ────────────────────────
{
  let isPremium = true;
  const svc = AS.createCloudArchiveService(mockTransport({ premium: () => isPremium }));
  const cal = await svc.getCalendar();
  ok('archive: premium calendar unlocked + past date', cal.locked === false && cal.dates[0].rankedDate === PAST);
  const pack = await svc.getPack(PAST);
  ok('archive: pack validated (5 slots, denom 100)', pack.slots.length === 5 && svc.denominator(pack) === 100);
  const start = await svc.startArchive(PAST, 'sess-flow-00000000');
  ok('archive: start → attempt (unranked, resumed false)', start.attemptId === 'arch-1' && start.resumed === false);
  // Free user is denied by the service (server-authoritative).
  isPremium = false;
  ok('archive: free calendar locked', (await svc.getCalendar()).locked === true);
  let denied = false; try { await svc.startArchive(PAST, 'sess-flow-00000000'); } catch (e) { denied = /archive_locked/.test(e.message); }
  ok('archive: free start denied (archive_locked)', denied);
}

// ── Flow 4: account switch isolation ─────────────────────────────────────────
{
  const premiumCtx = run([{ type: 'START', supported: true }, { type: 'ENTITLEMENT_LOADED', isPremium: true }, { type: 'OFFERING_LOADED', offering: { offeringId: 'default', packages: [] } }]);
  ok('A is premium', M.premiumUnlocked(premiumCtx));
  const afterSwitch = run([{ type: 'ACCOUNT_SWITCH' }, { type: 'START', supported: true }, { type: 'ENTITLEMENT_LOADED', isPremium: false }, { type: 'OFFERING_LOADED', offering: { offeringId: 'default', packages: [] } }], premiumCtx);
  ok('B after switch is NOT premium (no A bleed)', afterSwitch.state === 'ready_free' && !M.premiumUnlocked(afterSwitch));
  // B's ArchiveService (free) is locked.
  const svcB = AS.createCloudArchiveService(mockTransport({ premium: () => false }));
  ok('B archive calendar locked', (await svcB.getCalendar()).locked === true);
}

// ── Flow 5: expiration blocks a NEW start (active attempt already handled by policy) ──
{
  let premium = true;
  const svc = AS.createCloudArchiveService(mockTransport({ premium: () => premium }));
  const started = await svc.startArchive(PAST, 'sess-exp-000000000');
  ok('expiration flow: attempt started while premium', started.resumed === false);
  premium = false; // entitlement expires
  let blocked = false; try { await svc.startArchive(PAST, 'sess-exp-000000000'); } catch (e) { blocked = /archive_locked/.test(e.message); }
  ok('expiration flow: a NEW start is blocked once expired', blocked);
}

// ── Local mode: unsupported, never claims premium ────────────────────────────
{
  const local = AS.createLocalArchiveService();
  ok('local archive service is unsupported', local.supported === false);
  ok('local calendar is locked (no fake premium)', (await local.getCalendar()).locked === true);
  let threw = false; try { await local.startArchive(PAST, 'sess'); } catch { threw = true; }
  ok('local start throws unsupported', threw);
}

rmSync(out, { recursive: true, force: true });
if (failures.length) {
  console.error(`\n${failures.length} PREMIUM/ARCHIVE-FLOW CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} premium/archive-flow checks passed — purchase→server-confirm→unlock, restore, archive session, account isolation, expiration-blocks-new-start, local unsupported`);
