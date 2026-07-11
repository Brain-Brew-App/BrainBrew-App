/**
 * Guest session identity — platform wiring.
 *
 * Loads (or mints once, then persists) the opaque per-install guest id using
 * AsyncStorage, which is localStorage on web and native storage on device. Built
 * on the pure, tested core in `guestId.ts`; this file only adds randomness and
 * persistence, and it fails SAFELY — a storage error degrades to an in-memory id
 * for the session rather than blocking cloud play.
 *
 * The guest id is NOT authentication and never sufficient authorization on its
 * own; the server-issued attempt token is the real authority. It is designed to
 * be replaced by an authenticated Supabase user id in a later phase.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { GUEST_ID_STORAGE_KEY, resolveGuestId } from './guestId';

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__ === true;

/**
 * 32 hex characters of randomness. Prefers Web Crypto (present on web and modern
 * RN); falls back to a non-cryptographic mix — acceptable because this id is an
 * opaque device tag, not a secret (see module note).
 */
function randomHex(): string {
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto?.getRandomValues) {
    const bytes = g.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let out = '';
  while (out.length < 32) out += Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return out.slice(0, 32);
}

let cached: string | null = null;

/**
 * The persistent guest id for this install. Reused across restarts; generated
 * once on first run. Memoized in-process. Never throws — a storage failure
 * yields a fresh in-memory id and logs (dev only, no value).
 */
export async function getGuestId(): Promise<string> {
  if (cached) return cached;

  let stored: string | null = null;
  try {
    stored = await AsyncStorage.getItem(GUEST_ID_STORAGE_KEY);
  } catch {
    if (IS_DEV) console.warn('[guest] storage read failed; using an in-memory id for this session');
  }

  const { id, created } = resolveGuestId(stored, randomHex);
  if (created) {
    try {
      await AsyncStorage.setItem(GUEST_ID_STORAGE_KEY, id);
    } catch {
      if (IS_DEV) console.warn('[guest] storage write failed; id will not persist this session');
    }
  }
  cached = id;
  return id;
}

/** Test/diagnostic helper: forget the memoized id (does not clear storage). */
export function _resetGuestIdCache(): void {
  cached = null;
}
