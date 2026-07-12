/**
 * Release key check — `npm run release:key-check` (Phase 7J).
 *
 * A RevenueCat **Test Store** key (`test_…`) lets purchases succeed without any
 * real store. Shipping one in a preview/production build would mean real users
 * "buying" Premium for free against a fake store. This check makes that
 * impossible to do by accident: it fails the build.
 *
 * It also fails if any RevenueCat SDK key is hardcoded into tracked source (the
 * key belongs in the ignored `.env` locally and in EAS build env for real builds).
 *
 * Never prints a key value — only the mode name (`test_store` / `google_play`).
 * Run standalone, or automatically before an EAS build via `eas-build-pre-install`.
 */

import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/** Build profiles that reach a real store and therefore must never use `test_`. */
const STORE_PROFILES = new Set(['preview', 'production']);

/** Mode from key prefix — mirrors src/cloud/revenuecat/storeMode.ts. */
export function modeOf(key) {
  if (typeof key !== 'string' || key.trim().length === 0) return 'unconfigured';
  const k = key.trim();
  if (k.startsWith('test_')) return 'test_store';
  if (k.startsWith('goog_')) return 'google_play';
  if (k.startsWith('appl_')) return 'app_store';
  return 'invalid';
}

/**
 * The pure decision. `hardcodedKeyFiles` = tracked files containing a literal SDK
 * key (found by the caller via git grep) — always a failure, in any profile.
 */
export function assessRelease({ profile, androidKey, iosKey, hardcodedKeyFiles = [] }) {
  const failures = [];
  const notes = [];
  const isStoreBuild = STORE_PROFILES.has(profile);

  for (const [platform, key] of [['android', androidKey], ['ios', iosKey]]) {
    const mode = modeOf(key);
    if (mode === 'unconfigured') {
      // Not fatal here: a build may legitimately supply the key from EAS env at a
      // later step. It IS fatal on the device (the paywall shows "not configured").
      notes.push(`${platform}: no key present in this environment (mode=unconfigured)`);
      continue;
    }
    if (mode === 'invalid') {
      failures.push(`${platform}: unrecognised RevenueCat key prefix (mode=invalid) — refusing to build`);
      continue;
    }
    if (isStoreBuild && mode === 'test_store') {
      failures.push(`${platform}: Test Store key (mode=test_store) in a "${profile}" build — a store build must use goog_/appl_`);
      continue;
    }
    if (!isStoreBuild && mode === 'test_store') notes.push(`${platform}: mode=test_store (allowed in "${profile}")`);
    else notes.push(`${platform}: mode=${mode}`);
  }

  for (const f of hardcodedKeyFiles) failures.push(`hardcoded RevenueCat SDK key in tracked source: ${f}`);

  return { ok: failures.length === 0, failures, notes, profile, isStoreBuild };
}

/**
 * Is this matched token a documentation PLACEHOLDER rather than a real key?
 * Templates legitimately carry `goog_XXXXXXXX…`. Anything else that looks like a
 * key is treated as real — so a real key pasted into a tracked template is still
 * caught, which is exactly the mistake this guard exists to prevent.
 */
export function isPlaceholderKey(token) {
  const body = token.replace(/^(test|goog|appl)_/, '');
  return /^[Xx]+$/.test(body) || /XXXX/.test(body) || /^[A-Z_]*$/.test(body);
}

/** Tracked files containing a literal RevenueCat SDK key (value never printed). */
export function findHardcodedKeys() {
  let out = '';
  try {
    // -I = never match binary; -o = matched token only; -E = regex. Exit 1 = no match.
    out = execSync(`git grep -hoIE "(test|goog|appl)_[A-Za-z0-9]{20,}" -- .`, {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return []; // no matches at all — the good path
  }
  // Re-run per file so we can report WHICH file holds a non-placeholder key.
  const files = new Set();
  for (const line of out.split('\n')) {
    const token = line.trim();
    if (!token || isPlaceholderKey(token)) continue;
    try {
      const where = execSync(`git grep -lIF "${token}" -- .`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      for (const f of where.split('\n')) if (f.trim()) files.add(f.trim());
    } catch { /* vanished between calls */ }
  }
  return [...files];
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const profile = process.argv.find((a) => a.startsWith('--profile='))?.split('=')[1]
    ?? process.env.EAS_BUILD_PROFILE
    ?? 'development';

  const r = assessRelease({
    profile,
    androidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    iosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    hardcodedKeyFiles: findHardcodedKeys(),
  });

  console.log(`Release key check — profile "${r.profile}" (${r.isStoreBuild ? 'STORE build' : 'non-store build'})`);
  for (const n of r.notes) console.log(`  • ${n}`);
  if (!r.ok) {
    for (const f of r.failures) console.error(`  ✕ ${f}`);
    console.error('\n✕ Release key check FAILED. No key value was printed.');
    process.exit(1);
  }
  console.log('\n✓ Release key check passed (no Test Store key in a store build; no key in tracked source).');
}
