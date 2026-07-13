/**
 * RC1-A device driver — `node scripts/rc1-device.mjs <command>`.
 *
 * Thin, explicit adb wrapper for the B-series. It automates the REPETITIVE parts
 * (wiping app data, onboarding a fresh identity, force-stopping at an exact moment)
 * so that the interesting part of each test — what the app does afterwards — is what
 * gets human attention.
 *
 * It never asserts a pass. Server truth comes from `npm run rc1:state`.
 *
 * Commands:
 *   reset            wipe app data (fresh anonymous identity on next launch)
 *   launch           deep-link launch against Metro
 *   onboard <name>   type a username, pick UAE, continue
 *   uid              print the current Supabase user id from the logs
 *   kill             force-stop (the "app killed" event in B2/B3/B4)
 *   tap <x> <y>      raw tap
 *   text "<label>"   tap a UI element by its exact text (uiautomator)
 *   shot <name>      screenshot to the scratchpad
 *   ui               dump the visible text of the current screen
 */

import { execFileSync } from 'node:child_process';

const ADB = 'C:\\platform-tools\\adb.exe';
const PKG = 'com.brainbrew.app';
const URL = 'brainbrew://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081';
const SHOT_DIR = 'C:\\Users\\ASRock\\AppData\\Local\\Temp\\claude\\c--Users-ASRock-Desktop-BrainBrew-App\\db7f0f2c-fddd-4ad8-b6a3-e16f390ff53e\\scratchpad';

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dumpUi() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  return adb('shell', 'cat', '/sdcard/ui.xml');
}

/** Centre of the element whose text is exactly `label`. */
function findText(label) {
  const xml = dumpUi();
  const re = new RegExp(`text="${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`);
  const m = xml.match(re);
  if (!m) return null;
  return [Math.round((+m[1] + +m[3]) / 2), Math.round((+m[2] + +m[4]) / 2)];
}

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case 'reset':
    adb('shell', 'pm', 'clear', PKG);
    console.log('app data cleared — next launch is a NEW anonymous identity');
    break;

  case 'launch':
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
    adb('reverse', 'tcp:8081', 'tcp:8081');
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', URL, PKG);
    console.log('launched');
    break;

  case 'kill':
    adb('shell', 'am', 'force-stop', PKG);
    console.log('FORCE-STOPPED');
    break;

  case 'uid': {
    // The Supabase user id the app is running as, from RevenueCat's own log line.
    const log = adb('logcat', '-d', '-s', 'ReactNativeJS:D');
    const ids = [...log.matchAll(/App User ID[^0-9a-f]*([0-9a-f-]{36})/g)].map((m) => m[1]);
    console.log(ids.length ? ids[ids.length - 1] : 'not found in logs');
    break;
  }

  case 'onboard': {
    const name = rest[0] ?? `rc1a${Date.now() % 100000}`;
    await sleep(1000);
    const field = findText('e.g. quick_fox');
    if (!field) { console.log('username field not visible — is the app on the setup screen?'); break; }
    adb('shell', 'input', 'tap', String(field[0]), String(field[1]));
    await sleep(600);
    adb('shell', 'input', 'text', name);
    await sleep(2600);                       // server-side availability check
    // NB: never use KEYCODE_BACK to dismiss the keyboard here. If the keyboard is
    // already closed, BACK exits the app — which silently aborted onboarding.
    // Tapping the country closes the keyboard on its own.
    const uae = findText('United Arab Emirates');
    if (uae) { adb('shell', 'input', 'tap', String(uae[0]), String(uae[1])); await sleep(1500); }
    for (let i = 0; i < 3; i++) {
      const cont = findText('Continue');
      if (cont) {
        adb('shell', 'input', 'tap', String(cont[0]), String(cont[1]));
        console.log(`onboarded as ${name}`);
        break;
      }
      adb('shell', 'input', 'swipe', '540', '1800', '540', '1100', '300');  // reveal the CTA
      await sleep(900);
    }
    break;
  }

  case 'text': {
    const at = findText(rest.join(' '));
    if (!at) { console.log(`NOT FOUND: "${rest.join(' ')}"`); process.exit(2); }
    adb('shell', 'input', 'tap', String(at[0]), String(at[1]));
    console.log(`tapped "${rest.join(' ')}" at ${at[0]},${at[1]}`);
    break;
  }

  case 'tap':
    adb('shell', 'input', 'tap', rest[0], rest[1]);
    console.log(`tapped ${rest[0]},${rest[1]}`);
    break;

  case 'shot': {
    const name = rest[0] ?? 'shot';
    adb('shell', 'screencap', '-p', `/sdcard/${name}.png`);
    adb('pull', `/sdcard/${name}.png`, `${SHOT_DIR}\\${name}.png`);
    console.log(`${SHOT_DIR}\\${name}.png`);
    break;
  }

  case 'ui': {
    const xml = dumpUi();
    const texts = [...xml.matchAll(/text="([^"]{2,60})"/g)].map((m) => m[1]);
    console.log([...new Set(texts)].join(' | '));
    break;
  }

  default:
    console.log('commands: reset launch onboard <name> uid kill tap <x> <y> text "<label>" shot <name> ui');
}
