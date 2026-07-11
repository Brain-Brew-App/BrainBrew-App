/**
 * Attempt tokens — the server's proof that a client is allowed to open a puzzle
 * or submit an answer for a specific attempt.
 *
 * The publishable key identifies the *app*, never a *player* — so it cannot
 * authorize "this session owns attempt X". These short-lived HMAC tokens do.
 * start-attempt issues an `attempt` token bound to (attempt, session, pack).
 * open-puzzle exchanges it for an `open` token additionally bound to one slot,
 * which is the only thing submit-answer accepts.
 *
 * The token is `base64url(payloadJSON).base64url(HMAC-SHA256)`. Web Crypto is
 * available in both Deno (the Edge runtime) and Node ≥18, so the exact same
 * module runs in production and under `scripts/db/token-test.mjs`.
 *
 * The token is NOT the last line of defence — the DB constraints (one open per
 * slot, immutable once submitted, terminal-attempt trigger) independently reject
 * replays. The token stops a forged request before it ever reaches those.
 */

export type TokenType = 'attempt' | 'open';

export interface TokenPayload {
  typ: TokenType;
  aid: string; // attempt id
  uid: string; // authenticated auth.users id — the OWNER of this attempt (Phase 5B)
  sid: string; // install/session id — device metadata, bound for continuity (not authority)
  pid: string; // pack id
  slot?: string; // slot id — present on `open` tokens only
  iat: number; // issued-at, unix seconds
  exp: number; // expiry, unix seconds
  nonce: string; // uniqueness; makes every token distinct even for identical claims
}

export type VerifyFailure =
  | 'malformed'
  | 'bad_signature'
  | 'expired'
  | 'not_yet_valid'
  | 'wrong_type'
  | 'wrong_attempt'
  | 'wrong_user'
  | 'wrong_session'
  | 'wrong_slot';

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; code: VerifyFailure };

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** A random, URL-safe nonce. */
export function newNonce(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

/** Sign a payload into a `body.signature` token string. */
export async function signToken(secret: string, payload: TokenPayload): Promise<string> {
  const key = await hmacKey(secret);
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return `${body}.${b64urlEncode(sig)}`;
}

/**
 * Verify a token. `expect.now` is unix seconds (the caller passes the server
 * clock). The signature is checked with `crypto.subtle.verify`, which is
 * constant-time, before any claim is trusted.
 */
export async function verifyToken(
  secret: string,
  token: string,
  expect: { now: number; typ?: TokenType; aid?: string; uid?: string; sid?: string; slot?: string },
): Promise<VerifyResult> {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, code: 'malformed' };
  const [body, sig] = parts;

  let sigBytes: Uint8Array;
  try {
    sigBytes = b64urlDecode(sig);
  } catch {
    return { ok: false, code: 'malformed' };
  }

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, enc.encode(body));
  if (!valid) return { ok: false, code: 'bad_signature' };

  let payload: TokenPayload;
  try {
    payload = JSON.parse(dec.decode(b64urlDecode(body)));
  } catch {
    return { ok: false, code: 'malformed' };
  }
  if (
    typeof payload?.typ !== 'string' ||
    typeof payload?.aid !== 'string' ||
    typeof payload?.iat !== 'number' ||
    typeof payload?.exp !== 'number'
  ) {
    return { ok: false, code: 'malformed' };
  }

  if (expect.now >= payload.exp) return { ok: false, code: 'expired' };
  if (expect.now < payload.iat - 5) return { ok: false, code: 'not_yet_valid' }; // small clock-skew grace
  if (expect.typ && payload.typ !== expect.typ) return { ok: false, code: 'wrong_type' };
  if (expect.aid && payload.aid !== expect.aid) return { ok: false, code: 'wrong_attempt' };
  if (expect.uid && payload.uid !== expect.uid) return { ok: false, code: 'wrong_user' };
  if (expect.sid && payload.sid !== expect.sid) return { ok: false, code: 'wrong_session' };
  if (expect.slot && payload.slot !== expect.slot) return { ok: false, code: 'wrong_slot' };

  return { ok: true, payload };
}
