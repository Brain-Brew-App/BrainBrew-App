/**
 * Loads environment variables from the ignored local files into process.env,
 * WITHOUT printing any value. Import this at the top of privileged scripts.
 *
 * Order (later wins): `.env` (public), then `.env.db.local` (privileged).
 * Both are git-ignored. Values already in the shell environment take precedence
 * over the files, so `SUPABASE_SECRET_KEY=… node …` still works.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

function loadFile(name) {
  const path = resolve(ROOT, name);
  if (!existsSync(path)) return 0;
  let loaded = 0;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Shell env wins; files fill gaps only.
    if (process.env[key] === undefined) {
      process.env[key] = val;
      loaded++;
    }
  }
  return loaded;
}

loadFile('.env');
loadFile('.env.db.local');

/** True only if the value looks like a real filled-in credential, not a placeholder. */
export function hasRealValue(name) {
  const v = process.env[name];
  return Boolean(v) && !/your_|_here|xxxx|generate_a_|placeholder/i.test(v);
}
