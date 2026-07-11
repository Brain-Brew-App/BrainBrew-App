/**
 * Launch preflight — runs automatically before `npm start` / `npm run web`.
 *
 * It exists because of two failure modes that are silent, and therefore cost
 * real debugging time:
 *
 *  1. Wrong directory. The Expo project lives in `brainbrew-app/`, one level
 *     below the folder you probably opened. Running npm from the parent gives
 *     an ENOENT about a missing package.json that says nothing about Expo.
 *
 *  2. A stale Metro process already holding the port. `expo start` detects
 *     this, asks "Use port 8082 instead?", and — if it cannot prompt — prints
 *     "Skipping dev server" and **exits 0**. The command looks like it
 *     succeeded, no server is listening, and the browser shows nothing (or a
 *     cached page from the previous run).
 *
 * This turns both into a loud, actionable failure before Expo is ever invoked.
 */

import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { syncWebShell } from './sync-web-shell.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.RCT_METRO_PORT ?? process.env.PORT ?? 8081);

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function fail(title, lines) {
  console.error(`\n${red('✖ ' + title)}\n`);
  for (const line of lines) console.error(`  ${line}`);
  console.error('');
  process.exit(1);
}

// --- 1. Are we in the real project root? ------------------------------------

const wrongRoot = (missing) =>
  fail(`Not an Expo project root — ${missing} is missing.`, [
    `Expected it in: ${ROOT}`,
    '',
    'Run npm from the app folder, not the folder above it:',
    yellow('  cd "BrainBrew App/brainbrew-app"'),
  ]);

for (const required of ['package.json', 'index.ts']) {
  if (!existsSync(join(ROOT, required))) wrongRoot(required);
}

// The Expo config may be static (app.json) or dynamic (app.config.js/ts).
const hasExpoConfig = ['app.config.js', 'app.config.ts', 'app.json'].some((f) =>
  existsSync(join(ROOT, f)),
);
if (!hasExpoConfig) wrongRoot('app.config.js / app.json');

// --- 2. Is the Metro port already taken? ------------------------------------

const inUse = await new Promise((done) => {
  const probe = createServer();
  probe.once('error', (err) => done(err.code === 'EADDRINUSE'));
  probe.once('listening', () => probe.close(() => done(false)));
  probe.listen(PORT, '0.0.0.0');
});

if (inUse) {
  const kill =
    process.platform === 'win32'
      ? [
          `netstat -ano | findstr :${PORT}`,
          `taskkill /PID <the-pid-from-above> /F`,
        ]
      : [`lsof -ti :${PORT} | xargs kill -9`];

  fail(`Port ${PORT} is already in use — Metro cannot start.`, [
    'Expo would print "Skipping dev server" and exit 0 here, so the command',
    'would look successful while nothing is actually served.',
    '',
    'Usually this is a Metro process left over from an earlier run.',
    '',
    'Free the port:',
    ...kill.map((c) => yellow(`  ${c}`)),
    '',
    dim(`Or use a different port:  npx expo start --web --port 8082`),
  ]);
}

// --- 3. Keep the web HTML shell in step with the theme background ----------

const shell = syncWebShell();

console.log(
  dim(
    `✓ preflight: ${ROOT.split(/[\\/]/).pop()} · port ${PORT} free · background ${shell.background}` +
      (shell.changed ? ' (web shell rewritten)' : ''),
  ),
);
