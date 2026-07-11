/**
 * Run a command with the privileged env loaded from the ignored `.env.db.local`
 * (and `.env`), WITHOUT ever printing a credential value. Values flow only
 * through the child process's environment.
 *
 *   node scripts/db/with-secrets.mjs <command> [args...]
 *
 * Example: node scripts/db/with-secrets.mjs supabase db push
 */

import { spawnSync } from 'node:child_process';
import './load-env.mjs'; // populates process.env from .env then .env.db.local

const [, , cmd, ...args] = process.argv;
if (!cmd) {
  console.error('usage: node scripts/db/with-secrets.mjs <command> [args...]');
  process.exit(2);
}

const res = spawnSync(cmd, args, { stdio: 'inherit', env: process.env, shell: true });
process.exit(res.status ?? 1);
