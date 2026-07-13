/**
 * Premium state-machine + Archive client validation tests — `npm run test:premium-archive`.
 *
 * Proves the Phase 7J.4 CLIENT correctness core (pure, no device): the Premium
 * state machine (server-confirms-unlock, neutral cancel, single-flight, account
 * isolation), the bounded server-sync-wait, and the Archive forbidden-field /
 * shape validation — plus the Part-37 client mutation tests.
 */

import { compilePureModules } from './compile.mjs';
import { rmSync } from 'node:fs';

const { load, out } = compilePureModules();
const M = await load('cloud/revenuecat/premiumMachine.js');
const S = await load('cloud/revenuecat/serverSync.js');
const A = await load('cloud/archive/archiveValidate.js');

let passed = 0; const failures = [];
const ok = (n, c) => (c ? passed++ : failures.push(n));
const run = (events, ctx0) => events.reduce((c, e) => M.reduce(c, e), ctx0 ?? M.initialContext());

// ── Premium state machine ────────────────────────────────────────────────────
{
  let c = run([{ type: 'START', supported: true }]);
  ok('START(supported) → loading_entitlement', c.state === 'loading_entitlement');
  ok('START(unsupported) → unsupported_platform', run([{ type: 'START', supported: false }]).state === 'unsupported_platform');

  c = run([{ type: 'START', supported: true }, { type: 'ENTITLEMENT_LOADED', isPremium: false }, { type: 'OFFERING_LOADED', offering: { offeringId: 'default', packages: [] } }]);
  ok('free path → ready_free', c.state === 'ready_free');

  // CRITICAL: SDK "purchased" does NOT unlock premium — only the server does.
  const afterSdk = run([{ type: 'PURCHASE_START' }, { type: 'PURCHASE_RESULT', outcome: { status: 'purchased' } }], c);
  ok('SDK purchased → finalizing (NOT premium)', afterSdk.state === 'finalizing' && afterSdk.isPremium === false);
  ok('premiumUnlocked() false after SDK success alone', M.premiumUnlocked(afterSdk) === false);
  const confirmed = run([{ type: 'SYNC_CONFIRMED' }], afterSdk);
  ok('server SYNC_CONFIRMED → ready_premium', confirmed.state === 'ready_premium' && confirmed.isPremium === true);
  ok('premiumUnlocked() true only after server confirm', M.premiumUnlocked(confirmed) === true);

  // NEUTRAL cancel.
  ok('cancelled → cancelled (never error)', run([{ type: 'PURCHASE_START' }, { type: 'PURCHASE_RESULT', outcome: { status: 'cancelled' } }], c).state === 'cancelled');

  // SINGLE-FLIGHT: a second PURCHASE_START while purchasing/finalizing is ignored.
  const busy = run([{ type: 'PURCHASE_START' }], c);
  ok('duplicate PURCHASE_START collapses (still purchasing)', run([{ type: 'PURCHASE_START' }], busy).state === 'purchasing');
  ok('PURCHASE_START ignored while finalizing', run([{ type: 'PURCHASE_START' }], afterSdk).state === 'finalizing');

  // sync timeout → sync_delayed with a safe ref, never "failed".
  const delayed = run([{ type: 'SYNC_TIMEOUT', ref: 'sync-abc123-x' }], afterSdk);
  ok('SYNC_TIMEOUT → sync_delayed + diagnosticRef', delayed.state === 'sync_delayed' && delayed.diagnosticRef === 'sync-abc123-x');

  // conflict + restore.
  ok('purchase conflict → conflict', run([{ type: 'PURCHASE_START' }, { type: 'PURCHASE_RESULT', outcome: { status: 'error', code: 'conflict' } }], c).state === 'conflict');
  ok('restore restored → finalizing (awaits server)', run([{ type: 'RESTORE_START' }, { type: 'RESTORE_RESULT', outcome: { status: 'restored' } }], c).state === 'finalizing');
  ok('restore nothing → nothing_to_restore', run([{ type: 'RESTORE_START' }, { type: 'RESTORE_RESULT', outcome: { status: 'nothing_to_restore' } }], c).state === 'nothing_to_restore');

  // ACCOUNT ISOLATION: switching resets to a clean context (no premium bleed).
  const premiumCtx = { ...confirmed };
  ok('ACCOUNT_SWITCH resets state + premium', run([{ type: 'ACCOUNT_SWITCH' }], premiumCtx).state === 'idle' && run([{ type: 'ACCOUNT_SWITCH' }], premiumCtx).isPremium === false);
  ok('SIGN_OUT resets state + premium', run([{ type: 'SIGN_OUT' }], premiumCtx).isPremium === false);
}

// ── Server-sync bounded wait ─────────────────────────────────────────────────
ok('decideSync: server premium → confirmed', S.decideSync(true, 0) === 'confirmed');
ok('decideSync: not yet → continue (early)', S.decideSync(false, 0) === 'continue');
ok('decideSync: last attempt not premium → timeout', S.decideSync(false, S.MAX_SYNC_ATTEMPTS - 1) === 'timeout');
ok('decideSync: aborted → timeout', S.decideSync(false, 0, true) === 'timeout');
ok('backoff is bounded + non-decreasing at the tail', S.backoffFor(99) === S.SYNC_BACKOFF_MS[S.SYNC_BACKOFF_MS.length - 1]);
ok('diagnostic ref carries no provider id', /^sync-[a-z0-9]{1,6}-/.test(S.makeDiagnosticRef('abcdef0000', 1_700_000_000_000)));

// ── Archive validation + forbidden-field guard ───────────────────────────────
const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const future = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
{
  // forbidden-field guard (recursive)
  for (const bad of [{ correct_answer: 1 }, { slots: [{ public_payload: { oddTileId: 't3' } }] }, { a: { b: { receipt: 'x' } } }, { provider_customer_id: 'c' }]) {
    let threw = false; try { A.assertNoForbiddenFields(bad); } catch { threw = true; }
    ok(`forbidden guard rejects ${Object.keys(bad)[0]}`, threw);
  }
  ok('forbidden guard passes a clean payload', (() => { try { A.assertNoForbiddenFields({ ranked_date: past, slots: [{ position: 1, public_payload: { prompt: 'q', tiles: [{ id: 't', glyph: '△' }] } }] }); return true; } catch { return false; } })());

  // calendar: past-only + normalize
  const cal = A.validateCalendar({ locked: false, total: 1, dates: [{ ranked_date: past, difficulty_label: 'standard', incident: false, available: true }] });
  ok('calendar validates past date', cal.dates.length === 1 && cal.locked === false);
  ok('calendar rejects a non-past date', (() => { try { A.validateCalendar({ dates: [{ ranked_date: future }] }); return false; } catch { return true; } })());

  // pack: category order + void-aware denominator, no answers
  const pack = A.validatePack({ ranked_date: past, difficulty_label: 'standard', slots: [
    { position: 1, category: 'observation', engine_id: 'OBS_001', puzzle_id: 'p1', public_payload: { prompt: 'q' }, voided: false },
    { position: 2, category: 'pattern', engine_id: 'PAT_001', puzzle_id: 'p2', public_payload: { prompt: 'q' }, voided: true },
    { position: 3, category: 'logic', engine_id: 'LOG_001', puzzle_id: 'p3', public_payload: { prompt: 'q' }, voided: false },
    { position: 4, category: 'language-logic', engine_id: 'LNG_001', puzzle_id: 'p4', public_payload: { prompt: 'q' }, voided: false },
    { position: 5, category: 'attention-speed', engine_id: 'ATT_001', puzzle_id: 'p5', public_payload: { prompt: 'q' }, voided: false } ] });
  ok('pack validates + keeps 5 slots', pack.slots.length === 5);
  ok('active denominator excludes the voided slot (4×20=80)', A.activeDenominator(pack) === 80);
  ok('pack rejects wrong category order', (() => { try { A.validatePack({ ranked_date: past, slots: [{ position: 1, category: 'pattern', engine_id: 'x', puzzle_id: 'p', public_payload: {}, voided: false }] }); return false; } catch { return true; } })());
  ok('pack rejects an answer leak in a slot', (() => { try { A.validatePack({ ranked_date: past, slots: [{ position: 1, category: 'observation', public_payload: {}, oddTileId: 't3' }] }); return false; } catch { return true; } })());

  // start guard
  ok('archive start validates', A.validateArchiveStart({ attempt_id: 'a1', ranked_date: past, resumed: false }).attemptId === 'a1');
  ok('archive start rejects is_ranked=true', (() => { try { A.validateArchiveStart({ attempt_id: 'a', is_ranked: true }); return false; } catch { return true; } })());
  ok('archive start rejects a client score', (() => { try { A.validateArchiveStart({ attempt_id: 'a', final_score: 80 }); return false; } catch { return true; } })());
}


// ── Purchase must be startable from every state the user can be LOOKING at ────
// Regression (found on-device): PURCHASE_START was accepted only from ready_*, so a
// tap from `nothing_to_restore` ran the real SDK purchase — charging the user —
// while the machine ignored the event and the UI never entered `finalizing`.
{
  const withState = (state, isPremium = false) => ({
    state, isPremium, offering: { offeringId: 'default', packages: [] }, offeringError: null, diagnosticRef: null,
  });
  const startsFrom = (state) => M.reduce(withState(state), { type: 'PURCHASE_START' }).state === 'purchasing';

  for (const s of ['ready_free', 'ready_premium', 'cancelled', 'nothing_to_restore', 'conflict', 'error', 'network_error']) {
    ok(`purchase can start from ${s}`, startsFrom(s) === true);
    ok(`canStartPurchase(${s}) agrees with the reducer`, M.canStartPurchase(withState(s)) === true);
  }
  // Blocked: nothing to buy yet, no store, already paid, or already in flight.
  // (Reducing a blocked event returns the SAME context object — assert identity, not
  // the state name: from `purchasing`, "unchanged" is still `purchasing`.)
  const ignores = (state) => { const c = withState(state); return M.reduce(c, { type: 'PURCHASE_START' }) === c; };
  for (const s of ['idle', 'loading_entitlement', 'loading_offering', 'unsupported_platform', 'store_unavailable', 'purchasing', 'finalizing', 'restoring']) {
    ok(`purchase BLOCKED from ${s}`, ignores(s) === true);
    ok(`canStartPurchase(${s}) agrees with the reducer`, M.canStartPurchase(withState(s)) === false);
  }
  // The critical one: never re-charge someone whose purchase is already being finalized.
  ok('purchase BLOCKED from sync_delayed (already paid — never double-charge)', ignores('sync_delayed') === true);
  ok('canStartPurchase(sync_delayed) === false', M.canStartPurchase(withState('sync_delayed')) === false);

  // And the full path still works from a transient state.
  let c = withState('nothing_to_restore');
  c = M.reduce(c, { type: 'PURCHASE_START' });
  c = M.reduce(c, { type: 'PURCHASE_RESULT', outcome: { status: 'purchased' } });
  ok('nothing_to_restore → purchase → finalizing (not premium yet)', c.state === 'finalizing' && c.isPremium === false);
  c = M.reduce(c, { type: 'SYNC_CONFIRMED' });
  ok('…→ server confirm → ready_premium', c.state === 'ready_premium' && c.isPremium === true);
}

rmSync(out, { recursive: true, force: true });
if (failures.length) {
  console.error(`\n${failures.length} PREMIUM/ARCHIVE-CLIENT CHECK(S) FAILED:`);
  for (const f of failures) console.error(`  ✕ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} premium/archive-client checks passed — state machine (server-confirms-unlock, neutral cancel, single-flight, account isolation), bounded sync-wait, archive forbidden-field/shape validation, mutations`);
