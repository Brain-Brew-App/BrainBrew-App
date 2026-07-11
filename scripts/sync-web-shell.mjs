/**
 * Generates `public/index.html` from the theme's background token.
 *
 * Expo web serves an HTML shell before the JS bundle loads. Its <body> has no
 * background, so the browser paints white until React mounts — a visible flash
 * on every reload. `web.backgroundColor` in the Expo config does *not* fix this:
 * per the SDK 57 config reference it only feeds the PWA manifest.
 *
 * The fix is a custom `public/index.html` (Metro web overwrites the default with
 * it). HTML cannot import JSON, so rather than typing the hex a second time this
 * file writes the template from `src/theme/palette.json`.
 *
 * It runs from `scripts/preflight.mjs` before every launch, and `npm test`
 * asserts the committed output is still in sync.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PALETTE = join(ROOT, 'src', 'theme', 'palette.json');
const OUT = join(ROOT, 'public', 'index.html');

export function renderWebShell(background) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
    <meta name="theme-color" content="${background}" />
    <title>BrainBrew</title>
    <!--
      GENERATED FILE — do not edit by hand.
      Written by scripts/sync-web-shell.mjs from src/theme/palette.json.
      Edit the token there instead; this file is rewritten on every launch.
    -->
    <style id="expo-reset">
      /* These styles make the body full-height */
      html,
      body {
        height: 100%;
      }
      /* These styles disable body scrolling if you are using <ScrollView> */
      body {
        overflow: hidden;
      }
      /* These styles make the root element full-height */
      #root {
        display: flex;
        height: 100%;
        flex: 1;
      }
    </style>
    <style id="brainbrew-background">
      /* Painted before the JS bundle lands, so there is no white flash. */
      html,
      body,
      #root {
        background-color: ${background};
      }
    </style>
  </head>

  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
`;
}

export function syncWebShell() {
  const { background } = JSON.parse(readFileSync(PALETTE, 'utf8'));
  const html = renderWebShell(background);
  mkdirSync(dirname(OUT), { recursive: true });

  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    /* not written yet */
  }
  if (current !== html) writeFileSync(OUT, html, 'utf8');

  return { background, changed: current !== html, path: OUT };
}

// Allow `node scripts/sync-web-shell.mjs` directly.
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { background, changed } = syncWebShell();
  console.log(`public/index.html ${changed ? 'updated' : 'already in sync'} (${background})`);
}
