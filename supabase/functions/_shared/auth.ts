/**
 * Auth verification for the gameplay Edge Functions (Phase 5B; local verify in 7K.1).
 *
 * The publishable key proves "a BrainBrew app is calling"; it is NOT the player.
 * The player is the Supabase Auth user carried in the `Authorization: Bearer
 * <access_token>` header. We derive that user by CRYPTOGRAPHICALLY VERIFYING the
 * JWT — never by trusting a client-supplied id.
 *
 * PERFORMANCE — why this changed
 * ------------------------------
 * This used to call `auth.getUser()`, which is an HTTP round trip to the Auth server
 * on EVERY request. Eight gameplay functions do it, and one five-puzzle brew makes
 * ~12 authenticated calls (start + 5 open + 5 submit + complete) — so a player paid
 * twelve extra network hops per brew, one of them sitting directly between the last
 * answer and the Results screen.
 *
 * The project signs JWTs with ES256 and publishes a JWKS, so the signature can be
 * verified LOCALLY in microseconds. The key set is fetched once and cached by
 * `createRemoteJWKSet`; it refetches only on an unknown `kid` (i.e. key rotation).
 *
 * SECURITY — what is preserved, and the one trade-off
 * ---------------------------------------------------
 * Preserved: the token must carry a valid ES256 signature from THIS project, must not
 * be expired, must be issued by this project's auth server, must have audience
 * `authenticated`, must have role `authenticated`, and must carry a UUID `sub`. None
 * of that is forgeable — the signing key is private to Supabase.
 *
 * The trade-off: a session revoked (or a user banned) mid-token-lifetime is no longer
 * caught instantly; their existing access token stays valid until it expires (Supabase
 * default: 1 hour). `auth.getUser()` would have rejected it on the next call.
 *
 * That is acceptable here, and deliberately so: every function re-derives the player
 * from the verified `sub`, and the attempt token is separately HMAC-bound to that same
 * uid. Within that window a banned player can only continue playing THEIR OWN attempt.
 * They cannot read another player's data, cannot obtain a second ranked attempt, and
 * cannot alter a score — those invariants are enforced in the database, not here.
 *
 * Runs only under Deno. Never logs the token.
 */

import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5.9.6';
import { AppError } from './http.ts';

export interface AuthUser {
  id: string;
  isAnonymous: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let issuer = '';

function keySet() {
  if (jwks) return jwks;
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new AppError('server_misconfigured', 500);
  issuer = `${url}/auth/v1`;
  jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  return jwks;
}

/** Verify the caller's Auth session; throws `auth_required`/`auth_invalid` (401). */
export async function requireUser(req: Request): Promise<AuthUser> {
  const header = req.headers.get('Authorization') ?? req.headers.get('authorization');
  if (!header || !/^Bearer\s+.+/i.test(header)) throw new AppError('auth_required', 401);
  const token = header.replace(/^Bearer\s+/i, '').trim();

  const keys = keySet();

  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, keys, {
      issuer,
      audience: 'authenticated',
      algorithms: ['ES256'],
      clockTolerance: 5, // seconds — tolerate small device clock skew
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    // Bad signature, wrong issuer/audience, expired, or an unknown signing key.
    throw new AppError('auth_invalid', 401);
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (!UUID.test(sub)) throw new AppError('auth_invalid', 401);
  if (payload.role !== 'authenticated') throw new AppError('auth_invalid', 401);

  return { id: sub, isAnonymous: payload.is_anonymous === true };
}
