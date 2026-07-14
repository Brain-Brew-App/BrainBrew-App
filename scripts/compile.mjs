/**
 * Compiles the pure, platform-free modules with the project's own TypeScript so
 * plain Node can exercise them. Shared by `npm test` and `npm run audit`.
 *
 * Only modules that touch neither React nor React Native belong here — scoring,
 * content, validators, pack selection. Everything else is verified in a browser.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');

const SOURCES = [
  'src/scoring/brewScore.ts',
  'src/data/dailyPack.ts',
  'src/data/packs.ts',
  'src/content/library.ts',
  'src/content/validators.ts',
  'src/content/authoring.ts',
  'src/content/lexicon.ts',
  'src/content/engines.ts',
  'src/infrastructure/supabase/publicFields.ts',
  // Cloud client — pure, platform-free logic (mode, guest id, answer mapping,
  // payload validation, session state machine). The React/RN/network layers are
  // verified in a browser, not here.
  'src/cloud/mode.ts',
  'src/cloud/guestId.ts',
  'src/cloud/answerMap.ts',
  'src/cloud/validate.ts',
  'src/cloud/sessionMachine.ts',
  'src/cloud/rankedCta.ts',
  'src/cloud/errors.ts',
  'src/cloud/diagnostics.ts',
  'src/cloud/email.ts',
  'src/cloud/identities.ts',
  'src/cloud/shareSnapshot.ts',
  'src/cloud/practicePolicy.ts',
  'src/cloud/entitlements.ts',
  'src/cloud/revenuecat/types.ts',
  'src/cloud/revenuecat/adapter.ts',
  'src/cloud/revenuecat/offerings.ts',
  'src/cloud/revenuecat/service.ts',
  'src/cloud/revenuecat/premiumMachine.ts',
  'src/cloud/revenuecat/serverSync.ts',
  'src/cloud/archive/archiveValidate.ts',
  'src/cloud/archive/archiveService.ts',
  'src/cloud/analytics/analytics.ts',
];

/** Emits to a fresh temp dir and returns a loader for the compiled modules. */
export function compilePureModules() {
  const out = mkdtempSync(join(tmpdir(), 'brainbrew-'));

  // TypeScript's JS entrypoint, not the .bin shim: a .cmd shim cannot be exec'd
  // without a shell on Windows, and would fail silently here.
  const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

  try {
    execFileSync(
      process.execPath,
      [tsc, ...SOURCES, '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: ROOT, stdio: 'pipe' },
    );
  } catch (error) {
    // tsc exits non-zero for the deprecated-option notice (TS5107) while still
    // emitting. Any other diagnostic is a real failure.
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    const real = output.split('\n').filter((l) => /error TS\d+/.test(l) && !l.includes('TS5107'));
    if (real.length) {
      console.error('TypeScript failed to compile:\n');
      console.error(real.join('\n'));
      process.exit(1);
    }
  }

  return {
    out,
    load: (path) => import(pathToFileURL(join(out, path)).href),
    ROOT,
  };
}
