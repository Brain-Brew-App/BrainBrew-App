/**
 * Profile API boundary (Phase 5B, Task 7).
 *
 * The ONLY place the app talks to the profile RPCs. Each call runs as the
 * authenticated user (the JWT is attached automatically) and returns only the
 * allowlisted private-profile shape — no tokens, email, phone, moderation flags,
 * or historical guest ids. Username availability is advisory; the DB uniqueness
 * constraint is authoritative, so `setUsername` reports a race as `username_taken`.
 */

import { getSupabase } from '../infrastructure/supabase/client';

export type OnboardingStatus = 'username_required' | 'complete';
export type AccountType = 'anonymous' | 'permanent';

export interface Profile {
  id: string;
  username: string | null;
  country_code: string | null;
  display_country: boolean;
  onboarding_status: OnboardingStatus;
  account_type: AccountType;
  created_at: string;
}

export interface CountryOption {
  code: string;
  name: string;
}

export class ProfileError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'ProfileError';
  }
}

/** Stable codes the RPCs raise, surfaced from `error.message`. */
const KNOWN = new Set([
  'not_authenticated', 'invalid_username', 'invalid_length', 'username_not_allowed',
  'username_taken', 'invalid_country', 'username_required',
]);
function toCode(message: string | undefined): string {
  const m = (message ?? '').trim();
  for (const k of KNOWN) if (m.includes(k)) return k;
  return 'profile_error';
}

/** The current user's private profile, or null if not signed in. */
export async function getMyProfile(): Promise<Profile | null> {
  const { data, error } = await getSupabase().rpc('get_my_profile');
  if (error) throw new ProfileError(toCode(error.message));
  return (data as unknown as Profile | null) ?? null;
}

/** The active country list (reference data, no PII). */
export async function listCountries(): Promise<CountryOption[]> {
  const { data, error } = await getSupabase()
    .from('countries')
    .select('code, name')
    .eq('active', true)
    .order('display_order', { ascending: true });
  if (error) throw new ProfileError('countries_unavailable');
  return (data ?? []) as CountryOption[];
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
}

/** Advisory availability check (throttle friendly; the constraint is authoritative). */
export async function checkUsername(username: string): Promise<AvailabilityResult> {
  const { data, error } = await getSupabase().rpc('check_username_available', { p_username: username });
  if (error) throw new ProfileError(toCode(error.message));
  return (data as unknown as AvailabilityResult) ?? { available: false, reason: 'profile_error' };
}

/** Claim a username. Throws ProfileError('username_taken') on a race. */
export async function setUsername(username: string): Promise<void> {
  const { error } = await getSupabase().rpc('set_username', { p_username: username });
  if (error) throw new ProfileError(toCode(error.message));
}

/** Set the self-reported country (validated against the canonical list). */
export async function setCountry(code: string, display = true): Promise<void> {
  const { error } = await getSupabase().rpc('set_country', { p_country: code, p_display: display });
  if (error) throw new ProfileError(toCode(error.message));
}
