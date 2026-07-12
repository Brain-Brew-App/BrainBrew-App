/**
 * RevenueCat / EAS configuration readiness — `npm run revenuecat:config-check`.
 *
 * Distinguishes CODE readiness (in-repo config we can verify) from EXTERNAL-ACCOUNT
 * readiness (RevenueCat dashboard, Google Play, EAS env — Founder-owned). Fails
 * non-zero only on a missing CODE requirement, and NAMES it. Never prints any secret
 * value — it only reports whether an env var is present.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => { try { return readFileSync(resolve(ROOT, p), 'utf8'); } catch { return ''; } };

const codeFail = [];
const codeOk = [];
const externalPending = [];
const ck = (cond, name) => (cond ? codeOk.push(name) : codeFail.push(name));

// ── CODE readiness (verifiable in-repo) ──────────────────────────────────────
const appCfg = read('app.config.js');
ck(/package:\s*'com\.brainbrew\.app'/.test(appCfg), "android.package = com.brainbrew.app");
ck(/scheme:\s*'brainbrew'/.test(appCfg), "URL scheme = brainbrew");

const eas = read('eas.json');
for (const profile of ['development', 'preview', 'production']) ck(new RegExp(`"${profile}"`).test(eas), `eas.json profile: ${profile}`);
ck(/"developmentClient":\s*true/.test(eas), 'eas development uses developmentClient');

const platform = read('src/cloud/revenuecat/platform.ts');
ck(/EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY/.test(platform), 'code reads EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY (public key)');
ck(!/SUPABASE_SECRET_KEY|REVENUECAT_SECRET/.test(platform), 'no secret key referenced in client platform code');

ck(existsSync(resolve(ROOT, 'supabase/functions/revenuecat-webhook/index.ts')), 'revenuecat-webhook Edge Function present');
ck(existsSync(resolve(ROOT, 'supabase/functions/_shared/revenuecat.ts')), 'canonical provider re-fetch boundary present');
ck(existsSync(resolve(ROOT, 'supabase/functions/_shared/entitlementMap.ts')), 'canonical state mapper present');

// ── EXTERNAL-ACCOUNT readiness (env presence only — never the value) ─────────
const envPresent = (name) => typeof process.env[name] === 'string' && process.env[name].length > 0;
for (const [name, where] of [
  ['EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY', 'EAS build env (public Android SDK key)'],
  ['REVENUECAT_WEBHOOK_SECRET', 'Supabase Edge secret (webhook auth)'],
  ['REVENUECAT_SECRET_API_KEY', 'Supabase Edge secret (provider re-fetch)'],
]) {
  if (!envPresent(name)) externalPending.push(`${name} — set in ${where}`);
}
externalPending.push('RevenueCat dashboard: project + Android app (com.brainbrew.app) + entitlement brainbrew_premium + offering default + products brainbrew_premium_{monthly,annual} + $rc_{monthly,annual}');
externalPending.push('RevenueCat: webhook URL → deployed revenuecat-webhook function; transfer behavior = no-merge policy');
externalPending.push('Google Play Console: app + internal testing track + subscription base-plans + license tester + service-account link');
externalPending.push('EAS: android development build installed on the Founder S21+');

console.log('CODE readiness:');
for (const n of codeOk) console.log(`  ✓ ${n}`);
for (const n of codeFail) console.log(`  ✕ MISSING: ${n}`);
console.log('\nEXTERNAL-ACCOUNT readiness (Founder-owned — cannot be verified from code):');
for (const n of externalPending) console.log(`  • ${n}`);

if (codeFail.length) { console.error(`\n✕ ${codeFail.length} CODE requirement(s) missing.`); process.exit(1); }
console.log(`\n✓ Code is RevenueCat-ready (${codeOk.length} checks). External-account setup is the Founder gate above — no secret values were read or printed.`);
