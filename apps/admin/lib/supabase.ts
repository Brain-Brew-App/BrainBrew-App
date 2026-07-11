/**
 * Supabase clients — SERVER ONLY (Phase 7F).
 *
 * Two strictly-separated clients:
 *   • sessionClient()  — the admin's OWN cookie-bound auth session (anon key).
 *     Used only to verify WHO is calling (auth.getUser()).
 *   • adminClient()    — the SERVICE ROLE. Bypasses RLS; used for privileged reads
 *     ONLY after the caller is verified to be an active admin. NEVER exposed to
 *     the browser (no NEXT_PUBLIC_*), never returned to a client component.
 *
 * If this file is ever imported from a client component, the missing server env
 * makes it fail fast rather than leak — but it must never be.
 */

import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

function requireEnv(v: string | undefined, name: string): string {
  if (!v) throw new Error(`Missing server env ${name}`);
  return v;
}

/** The admin's cookie-bound session client (anon key). Verifies identity only. */
export async function sessionClient() {
  const cookieStore = await cookies();
  return createServerClient(requireEnv(URL, 'SUPABASE_URL'), requireEnv(ANON, 'SUPABASE_ANON_KEY'), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* called from a Server Component render — safe to ignore */ }
      },
    },
  });
}

let _admin: SupabaseClient | null = null;
/** The service-role client. Server-only; use ONLY behind an admin check. */
export function adminClient(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(requireEnv(URL, 'SUPABASE_URL'), requireEnv(SECRET, 'SUPABASE_SECRET_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}
