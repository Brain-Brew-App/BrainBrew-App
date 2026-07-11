/**
 * Secret scan — `npm run secret-scan`.
 *
 * Scans git-tracked files (and, if run in a repo, the staged set) for
 * privileged-credential patterns. Reports LOCATIONS ONLY — never a value. Exits
 * non-zero on any hit, so it can gate CI or a pre-commit hook.
 *
 * The publishable key (sb_publishable_...) is NOT flagged: it is public by
 * design and may appear in the ignored .env. Everything privileged is flagged.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');

/**
 * Privileged patterns — real credential VALUE shapes only (publishable excluded).
 * We match the value, not the assignment, so a variable name in a comment or an
 * `.env.example` placeholder is never flagged; only an actual key/URL/token is.
 */
const PATTERNS = [
  { name: 'Supabase secret key', re: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: 'Supabase service_role/anon JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Supabase access token', re: /sbp_[A-Za-z0-9]{20,}/ },
  { name: 'Direct Postgres connection string with password', re: /postgres(?:ql)?:\/\/[^\s:"'/]+:[^\s@"']+@/ },
];

/** Skip a match that is obviously a placeholder rather than a real credential. */
const PLACEHOLDER = /x{4,}|\.\.\.|YOUR_|<[^>]*>|example|placeholder|changeme|0{6,}/i;

/**
 * Everything that could enter git: tracked files PLUS untracked files that are
 * not git-ignored. `.env` and other ignored secrets are excluded — which is the
 * point: they must stay untracked. A secret in a NEW file is caught here before
 * it is ever committed.
 */
function scannableFiles() {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
  const untracked = execSync('git ls-files --others --exclude-standard', { cwd: ROOT, encoding: 'utf8' });
  const all = new Set(
    `${tracked}\n${untracked}`.split('\n').map((f) => f.trim()).filter(Boolean),
  );
  return [...all];
}

const hits = [];
let scanned = 0;

for (const rel of scannableFiles()) {
  // Skip binary-ish and lockfiles; scan text sources, configs, docs, sql, env template.
  if (/\.(png|jpg|jpeg|gif|ico|ttf|otf|woff2?|mp4|zip|lock)$/i.test(rel)) continue;
  let text;
  try {
    text = readFileSync(resolve(ROOT, rel), 'utf8');
  } catch {
    continue;
  }
  scanned++;
  const lines = text.split('\n');
  for (const { name, re } of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      if (m && !PLACEHOLDER.test(m[0])) hits.push({ file: rel, line: i + 1, kind: name });
    }
  }
}

console.log(`Secret scan: ${scanned} tracked text files.`);

if (hits.length) {
  console.error(`\n✕ ${hits.length} POSSIBLE PRIVILEGED CREDENTIAL(S) IN TRACKED FILES:\n`);
  for (const h of hits) console.error(`  ${h.file}:${h.line} — ${h.kind} (value withheld)`);
  console.error('\nRemove it, rotate the credential (git history retains deleted secrets), and re-scan.\n');
  process.exit(1);
}

console.log('✓ No privileged credentials found in tracked files. (The publishable key is public and not flagged.)');
