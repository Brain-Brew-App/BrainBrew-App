/**
 * Auth verification for the gameplay Edge Functions (Phase 5B).
 *
 * The publishable key proves "a BrainBrew app is calling"; it is NOT the player.
 * The player is the Supabase Auth user carried in the `Authorization: Bearer
 * <access_token>` header. This derives that user by VALIDATING the JWT against
 * the Auth server (`auth.getUser`) with an anon-key client bound to the caller's
 * header — never by trusting a client-supplied id. Returns the verified user id
 * and the `is_anonymous` claim (kept for future ranked-eligibility rules).
 *
 * Runs only under Deno. Never logs the token.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { AppError } from './http.ts';

export interface AuthUser {
  id: string;
  isAnonymous: boolean;
}

/** Verify the caller's Auth session; throws `auth_required`/`auth_invalid` (401). */
export async function requireUser(req: Request): Promise<AuthUser> {
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!authHeader || !/^Bearer\s+.+/i.test(authHeader)) throw new AppError('auth_required', 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new AppError('server_misconfigured', 500);

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) throw new AppError('auth_invalid', 401);

  return { id: data.user.id, isAnonymous: data.user.is_anonymous ?? false };
}
