/**
 * Linked-identity helpers — pure, platform-free, tested.
 *
 * The source of truth for which recovery methods a user has is the Supabase Auth
 * `identities` array (never a cached copy in the profile table). This module
 * derives a small, display-safe view: which providers are linked, and whether
 * the user is still anonymous. It never exposes provider subject ids, tokens, or
 * raw provider metadata.
 */

export interface AuthIdentityLite {
  provider: string;
}

export interface LinkedMethods {
  email: boolean;
  google: boolean;
  /** True only when the user has no permanent identity yet. */
  anonymous: boolean;
  /** How many permanent (non-anonymous) identities are linked. */
  count: number;
}

/**
 * Derive linked methods from the identities array and the `is_anonymous` flag.
 * `email`/`google` reflect linked providers; `anonymous` is true only when there
 * is no permanent identity.
 */
export function linkedMethods(
  identities: AuthIdentityLite[] | null | undefined,
  isAnonymous: boolean | undefined,
): LinkedMethods {
  const providers = new Set((identities ?? []).map((i) => i.provider).filter((p) => p && p !== 'anonymous'));
  const email = providers.has('email');
  const google = providers.has('google');
  const count = providers.size;
  return { email, google, anonymous: count === 0 && isAnonymous !== false, count };
}

/** True once at least one permanent recovery method is linked. */
export function hasPermanentIdentity(m: LinkedMethods): boolean {
  return m.count > 0;
}

/** Whether removing `provider` would leave the user with no recovery method. */
export function isLastMethod(m: LinkedMethods, provider: 'email' | 'google'): boolean {
  return m.count <= 1 && m[provider];
}
