/**
 * Identity bootstrap — the ONE place that creates/restores the player's Supabase
 * Auth session (Phase 5B). The anonymous auth user's UUID is the canonical player
 * identity; the old per-install `guest_<hex>` id is demoted to install metadata
 * (the `session_id` on attempts) and is never authority again.
 *
 * A Supabase ANONYMOUS user is authenticated (has an access-token JWT, uses the
 * `authenticated` role, `is_anonymous: true`) — distinct from the public,
 * unauthenticated `anon` API role. It stays anonymous until an email/OAuth
 * identity is linked (a future phase).
 *
 * Guest-ID migration decision (Task 3): the legacy guest id was NEVER
 * server-verifiable, so pre-Auth guest attempts CANNOT be safely claimed — a
 * client could otherwise assert any id. They are left historical and unowned.
 * The guest id continues only as the install id; no attempt is relinked.
 *
 * No `supabase.auth` call is made anywhere else in the app.
 */

import { getSupabase } from '../infrastructure/supabase/client';
import { getGuestId } from './guestSession';

export type IdentityPhase =
  | 'uninitialized'
  | 'restoring'
  | 'creating_anonymous_user'
  | 'ready'
  | 'error';

export interface Identity {
  /** The canonical player id — the Supabase auth.users UUID. */
  userId: string;
  isAnonymous: boolean;
  /** Opaque per-install id, carried as attempt `session_id` metadata (not authority). */
  installId: string;
}

const GUEST_MIGRATION_KEY = 'brainbrew.guest.migrated';

let current: Identity | null = null;
let inflight: Promise<Identity> | null = null;

/**
 * Restore an existing Auth session or create ONE anonymous user. Concurrent and
 * repeated calls collapse onto a single in-flight bootstrap, so a reload race
 * can never create two anonymous users.
 */
export function bootstrapIdentity(onPhase?: (p: IdentityPhase) => void): Promise<Identity> {
  if (current) return Promise.resolve(current);
  if (inflight) return inflight;

  inflight = (async () => {
    const sb = getSupabase();

    onPhase?.('restoring');
    const { data: sessionData } = await sb.auth.getSession();
    let user = sessionData.session?.user ?? null;

    if (!user) {
      onPhase?.('creating_anonymous_user');
      const { data, error } = await sb.auth.signInAnonymously();
      if (error || !data.user) throw new Error(error?.message ?? 'anonymous_sign_in_failed');
      user = data.user;
    }

    // Demote the legacy guest id to install metadata (see module note). One-time,
    // idempotent; no attempt is relinked.
    const installId = await getGuestId();
    await recordGuestMigration(installId, user.id);

    current = { userId: user.id, isAnonymous: user.is_anonymous ?? false, installId };
    onPhase?.('ready');
    return current;
  })()
    .catch((e) => {
      onPhase?.('error');
      throw e;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** The bootstrapped identity, or null before `bootstrapIdentity` resolves. */
export function currentIdentity(): Identity | null {
  return current;
}

async function recordGuestMigration(installId: string, userId: string): Promise<void> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const existing = await AsyncStorage.getItem(GUEST_MIGRATION_KEY);
    if (!existing) {
      // Metadata only — used for diagnostics, never as authority.
      await AsyncStorage.setItem(GUEST_MIGRATION_KEY, JSON.stringify({ installId, userId }));
    }
  } catch {
    /* migration record is best-effort; failure never blocks play */
  }
}

/** Test/diagnostic: forget the in-process identity (does not sign out). */
export function _resetIdentityCache(): void {
  current = null;
  inflight = null;
}
