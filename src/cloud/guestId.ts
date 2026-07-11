/**
 * Guest session identity — pure core.
 *
 * A cloud attempt needs a stable per-install identifier to group a device's
 * attempts before accounts exist. It is deliberately the SMALLEST safe thing:
 * an opaque random id, generated once, persisted, reused. It is NOT
 * authentication and is never sufficient authorization on its own — the
 * server-issued attempt token is the real attempt authority (see
 * docs/SERVER_AUTHORITATIVE_GAMEPLAY.md). It carries no personal information.
 *
 * This module is pure and platform-free (storage + randomness are injected), so
 * it is unit-testable in Node. The platform wiring lives in `guestSession.ts`.
 */

/** The server requires a session id ≥16 chars; this format is 6 + 32 = 38. */
const PREFIX = 'guest_';
const HEX_LEN = 32;
const GUEST_ID_RE = /^guest_[0-9a-f]{32}$/;

/** Build a guest id from a hex string of at least 32 chars (lowercased, trimmed to 32). */
export function formatGuestId(hex: string): string {
  const clean = hex.toLowerCase().replace(/[^0-9a-f]/g, '');
  if (clean.length < HEX_LEN) {
    throw new Error('guest id needs at least 32 hex characters of randomness');
  }
  return PREFIX + clean.slice(0, HEX_LEN);
}

/** True for a well-formed guest id produced by `formatGuestId`. */
export function isValidGuestId(value: unknown): value is string {
  return typeof value === 'string' && GUEST_ID_RE.test(value);
}

/**
 * Return the stored id if it is valid, otherwise mint a fresh one from the
 * provided randomness. Pure: the caller supplies the persisted value and a
 * random-hex generator, and decides whether to persist the result.
 */
export function resolveGuestId(
  stored: unknown,
  randomHex: () => string,
): { id: string; created: boolean } {
  if (isValidGuestId(stored)) return { id: stored, created: false };
  return { id: formatGuestId(randomHex()), created: true };
}

export const GUEST_ID_STORAGE_KEY = 'brainbrew.guest.session.id';
