/**
 * Shared PGlite helpers for the database scripts: a fresh in-process Postgres
 * with the Supabase roles created and the committed migrations applied, plus an
 * idempotent upsert that mirrors what the real importer does over supabase-js.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { PGlite } from '@electric-sql/pglite';

const ROOT = resolve(import.meta.dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

/**
 * A minimal stand-in for Supabase's managed `auth` schema, so migrations that
 * reference `auth.users` / `auth.uid()` apply and RLS is testable. On the real
 * project these are provided by Supabase Auth. `auth.uid()`/`auth.jwt()` read the
 * request JWT claims exactly as Supabase does, so tests set them with
 * `set local request.jwt.claims = '{"sub":"…","role":"authenticated","is_anonymous":true}'`.
 */
export const AUTH_MOCK = `
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    is_anonymous boolean not null default true,
    created_at timestamptz not null default now()
  );
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
  $$;
  create or replace function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
`;

/** Set the acting Supabase user for the current session (or clear with null). */
export async function actAs(db, userId, { isAnonymous = true, role = 'authenticated' } = {}) {
  if (userId === null) {
    await db.exec(`select set_config('request.jwt.claims', '', false); reset role;`);
    return;
  }
  const claims = JSON.stringify({ sub: userId, role, is_anonymous: isAnonymous });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
  await db.exec(`set role ${role};`);
}

/** A fresh DB with roles + the auth mock + every committed migration applied, in order. */
export async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  await db.exec(AUTH_MOCK);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  return db;
}

/** JSON-typed columns need an explicit ::jsonb cast on the bound parameter. */
const isJsonValue = (v) => v !== null && typeof v === 'object';

/**
 * Upsert rows into `table` on `conflictKey` (a column, or an array of columns
 * for a composite key), updating every non-key column. The same conflict
 * semantics the supabase-js importer uses, so idempotency proven here holds
 * there.
 */
export async function upsert(db, table, rows, conflictKey) {
  const keyCols = Array.isArray(conflictKey) ? conflictKey : [conflictKey];
  for (const row of rows) {
    const cols = Object.keys(row);
    const placeholders = cols.map((c, i) => (isJsonValue(row[c]) ? `$${i + 1}::jsonb` : `$${i + 1}`));
    const params = cols.map((c) => (isJsonValue(row[c]) ? JSON.stringify(row[c]) : row[c]));
    const updates = cols
      .filter((c) => !keyCols.includes(c))
      .map((c) => `${c} = excluded.${c}`)
      .join(', ');

    const sql =
      `insert into ${table} (${cols.join(', ')}) values (${placeholders.join(', ')}) ` +
      `on conflict (${keyCols.join(', ')}) do update set ${updates}`;
    await db.query(sql, params);
  }
}

export const count = async (db, table) =>
  (await db.query(`select count(*)::int c from ${table}`)).rows[0].c;
