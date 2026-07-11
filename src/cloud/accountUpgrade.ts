/**
 * Account-upgrade service (Phase 5C) — the ONLY place that performs email-related
 * Auth operations. Screens call this, never `supabase.auth` directly.
 *
 * Chosen mechanism (verified against the live project): the current ANONYMOUS
 * user gains an email identity via `updateUser({ email })`. Supabase sends a
 * confirmation link; opening it verifies email ownership and upgrades the SAME
 * `auth.users` UUID to permanent (`is_anonymous -> false`, email identity added).
 * No second user is created. The upgrade STATE is derived from the verified Auth
 * user (`is_anonymous`, `email`, `new_email`) — never from a client assertion or
 * from merely sending an email. `account_type` is flipped by the server RPC
 * `sync_account_type()` only after Auth confirms.
 *
 * Recovery (existing permanent account) uses the same passwordless email method
 * (`signInWithOtp`, no user creation). Permanent users may sign out; anonymous
 * users may not (it would orphan their progress).
 *
 * No token, code, or full email is ever logged. The entered email is NOT stored
 * in the BrainBrew profile — Supabase Auth is the source of truth for identity.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { getSupabase } from '../infrastructure/supabase/client';
import { maskEmail, validateEmail } from './email';
import { _resetIdentityCache } from './identity';
import { linkedMethods, type LinkedMethods } from './identities';

export { maskEmail, normalizeEmail, validateEmail } from './email';

export type UpgradeStatus =
  | 'idle'
  | 'requesting'
  | 'opening_provider'
  | 'verification_sent'
  | 'completed'
  | 'linked'
  | 'cancelled'
  | 'conflict'
  | 'expired'
  | 'error';

/** Non-sensitive marker that a Google link is in progress for a specific user. */
const LINK_PENDING_KEY = 'brainbrew.link.pending';

interface LinkPending {
  uid: string;
  provider: 'google';
}

async function setLinkPending(p: LinkPending): Promise<void> {
  try { await AsyncStorage.setItem(LINK_PENDING_KEY, JSON.stringify(p)); } catch { /* best effort */ }
}
async function getLinkPending(): Promise<LinkPending | null> {
  try {
    const raw = await AsyncStorage.getItem(LINK_PENDING_KEY);
    return raw ? (JSON.parse(raw) as LinkPending) : null;
  } catch { return null; }
}
async function clearLinkPending(): Promise<void> {
  try { await AsyncStorage.removeItem(LINK_PENDING_KEY); } catch { /* best effort */ }
}

export interface UpgradeResult {
  status: UpgradeStatus;
  /** Masked new/pending email for display. Never the full address. */
  emailMasked?: string;
  /** A stable, non-sensitive code for UI copy. */
  code?: string;
}

// --- redirect target for the confirmation link -----------------------------

function redirectTo(): string {
  if (Platform.OS === 'web') {
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
    return origin ?? 'http://localhost:8081';
  }
  return 'brainbrew://auth-callback';
}

// --- upgrade state, derived from the VERIFIED auth user ---------------------

interface AuthUserLite {
  is_anonymous?: boolean;
  email?: string | null;
  new_email?: string | null;
}

function deriveStatus(u: AuthUserLite | null): UpgradeResult {
  if (!u) return { status: 'idle' };
  if (u.is_anonymous === false && u.email) return { status: 'completed', emailMasked: maskEmail(u.email) };
  if (u.new_email) return { status: 'verification_sent', emailMasked: maskEmail(u.new_email) };
  return { status: 'idle' };
}

/** The upgrade status from current Auth state (refreshes the session first). */
export async function getUpgradeStatus(): Promise<UpgradeResult> {
  const sb = getSupabase();
  await sb.auth.refreshSession().catch(() => undefined);
  const { data } = await sb.auth.getUser();
  return deriveStatus(data.user as AuthUserLite | null);
}

// Single-flight guard against duplicate upgrade requests.
let requesting = false;

/**
 * Start the email upgrade for the CURRENT anonymous user. Verifies the user is
 * authenticated and anonymous first; a permanent user is already secured.
 */
export async function requestEmailUpgrade(rawEmail: string): Promise<UpgradeResult> {
  if (requesting) return { status: 'requesting' };
  const v = validateEmail(rawEmail);
  if (!v.ok) return { status: 'error', code: v.error };

  requesting = true;
  try {
    const sb = getSupabase();
    const { data: userData } = await sb.auth.getUser();
    const u = userData.user as AuthUserLite | null;
    if (!u) return { status: 'error', code: 'not_authenticated' };
    if (u.is_anonymous === false) return { status: 'completed', emailMasked: u.email ? maskEmail(u.email) : undefined };

    const { error } = await sb.auth.updateUser({ email: v.email }, { emailRedirectTo: redirectTo() });
    if (error) {
      const msg = (error.message || '').toLowerCase();
      const code = (error as { code?: string }).code ?? '';
      if (code === 'email_exists' || msg.includes('already') || msg.includes('registered')) {
        return { status: 'conflict', code: 'email_conflict' };
      }
      if (code === 'over_email_send_rate_limit' || msg.includes('rate limit')) {
        return { status: 'error', code: 'rate_limited' };
      }
      return { status: 'error', code: 'upgrade_failed' };
    }
    return { status: 'verification_sent', emailMasked: maskEmail(v.email) };
  } finally {
    requesting = false;
  }
}

/**
 * Process an auth callback (email link). On web, supabase-js has already parsed
 * `?code=` (detectSessionInUrl); on native, exchange the deep-link code. Then
 * re-derive status and, if upgraded, sync account_type.
 */
export async function processAuthCallback(url?: string): Promise<UpgradeResult> {
  const sb = getSupabase();
  try {
    if (url && Platform.OS !== 'web') await sb.auth.exchangeCodeForSession(url);
  } catch {
    await clearLinkPending();
    return { status: 'expired', code: 'link_expired' };
  }

  // A pending Google LINK must resolve to the SAME user. This is the hard
  // continuity check: if the callback produced a different UUID (e.g. the Google
  // identity belongs to another account), it is a conflict — never synced, never
  // a profile/attempt change.
  const pending = await getLinkPending();
  if (pending) {
    const { data } = await sb.auth.getUser();
    const u = data.user;
    await clearLinkPending();
    if (!u) return { status: 'error', code: 'not_authenticated' };
    if (u.id !== pending.uid) return { status: 'conflict', code: 'uuid_mismatch' };
    if (!linkedMethods(u.identities, u.is_anonymous).google) return { status: 'error', code: 'link_failed' };
    await syncAccountType();
    return { status: 'linked' };
  }

  const status = await getUpgradeStatus();
  if (status.status === 'completed') await syncAccountType();
  return status;
}

/** Flip profiles.account_type from the verified Auth claim (server-controlled). */
export async function syncAccountType(): Promise<'anonymous' | 'permanent' | 'error'> {
  try {
    const { data, error } = await getSupabase().rpc('sync_account_type');
    if (error) return 'error';
    return ((data as { account_type?: string } | null)?.account_type as 'anonymous' | 'permanent') ?? 'error';
  } catch {
    return 'error';
  }
}

/** Cancel a pending upgrade (the pending change simply expires; nothing persisted). */
export async function cancelPendingUpgrade(): Promise<void> {
  /* no client-persisted token/OTP to clear */
}

// --- Recovery: sign in to an EXISTING permanent account (Task 9) -----------

/**
 * Send a passwordless sign-in link to an existing permanent account. Never
 * creates a user, and is never auto-triggered by a conflict — the caller chooses
 * it explicitly. Copy stays generic regardless of whether the address exists.
 */
export async function requestSignIn(rawEmail: string): Promise<UpgradeResult> {
  const v = validateEmail(rawEmail);
  if (!v.ok) return { status: 'error', code: v.error };
  const { error } = await getSupabase().auth.signInWithOtp({
    email: v.email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo() },
  });
  if (error && /rate limit/i.test(error.message)) return { status: 'error', code: 'rate_limited' };
  // Anti-enumeration: report "sent" whether or not the address exists.
  return { status: 'verification_sent', emailMasked: maskEmail(v.email) };
}

// --- Safe sign-out for PERMANENT accounts only (Task 10) --------------------

// --- Google linking & recovery (Phase 5D) ----------------------------------

/** Which recovery methods the current user has, from live Auth identities. */
export async function getLinkedMethods(): Promise<LinkedMethods> {
  const { data } = await getSupabase().auth.getUser();
  const u = data.user;
  return linkedMethods(u?.identities, u?.is_anonymous);
}

let oauthInFlight = false;

/**
 * Run the Google OAuth flow. `link` attaches Google to the CURRENT user (manual
 * identity linking, same UUID). `signin` is an independent sign-in (recovery).
 * Web redirects the browser; native opens an auth session and exchanges the code.
 * Requests only the minimal `email profile` scopes — no contacts/drive/etc.
 */
async function runOAuth(mode: 'link' | 'signin'): Promise<UpgradeResult> {
  if (oauthInFlight) return { status: 'opening_provider' };
  oauthInFlight = true;
  try {
    const sb = getSupabase();
    const redirect = redirectTo();
    const options = { redirectTo: redirect, scopes: 'email profile', skipBrowserRedirect: Platform.OS !== 'web' } as const;
    const { data, error } =
      mode === 'link'
        ? await sb.auth.linkIdentity({ provider: 'google', options })
        : await sb.auth.signInWithOAuth({ provider: 'google', options });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      const code = (error as { code?: string }).code ?? '';
      await clearLinkPending();
      if (msg.includes('manual linking') || msg.includes('not enabled')) return { status: 'error', code: 'linking_disabled' };
      if (code === 'identity_already_exists' || msg.includes('already')) return { status: 'conflict', code: 'google_conflict' };
      return { status: 'error', code: 'oauth_failed' };
    }

    if (Platform.OS === 'web') {
      // supabase-js navigates the browser to Google; the callback returns to the
      // app and is handled by processAuthCallback on next load.
      return { status: 'opening_provider' };
    }

    const url = data?.url;
    if (!url) { await clearLinkPending(); return { status: 'error', code: 'oauth_failed' }; }
    const result = await WebBrowser.openAuthSessionAsync(url, redirect);
    if (result.type === 'cancel' || result.type === 'dismiss') { await clearLinkPending(); return { status: 'cancelled' }; }
    if (result.type !== 'success' || !result.url) { await clearLinkPending(); return { status: 'error', code: 'oauth_failed' }; }
    return processAuthCallback(result.url);
  } finally {
    oauthInFlight = false;
  }
}

/**
 * Link Google to the CURRENT signed-in user. Captures the UUID first and records
 * a pending-link marker so the callback can prove continuity. Idempotent if
 * Google is already linked.
 */
export async function linkGoogle(): Promise<UpgradeResult> {
  const sb = getSupabase();
  const { data } = await sb.auth.getUser();
  const u = data.user;
  if (!u) return { status: 'error', code: 'not_authenticated' };
  if (linkedMethods(u.identities, u.is_anonymous).google) return { status: 'linked' };
  await setLinkPending({ uid: u.id, provider: 'google' });
  return runOAuth('link');
}

/**
 * Sign in with Google to RESTORE an existing account (recovery). This is an
 * independent sign-in, NOT linking — it never merges a current guest. Callers
 * must choose it explicitly and warn before replacing an anonymous session.
 */
export async function signInWithGoogle(): Promise<UpgradeResult> {
  await clearLinkPending();
  return runOAuth('signin');
}

export async function signOutPermanent(): Promise<{ ok: boolean; code?: string }> {
  const sb = getSupabase();
  const { data } = await sb.auth.getUser();
  const u = data.user as AuthUserLite | null;
  if (!u) return { ok: false, code: 'not_authenticated' };
  if (u.is_anonymous !== false) return { ok: false, code: 'anonymous_no_signout' };
  await sb.auth.signOut();
  await clearLinkPending();
  _resetIdentityCache();
  return { ok: true };
}
