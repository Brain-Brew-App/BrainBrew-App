/**
 * The Supabase client — now Auth-enabled for cloud mode (Phase 5B).
 *
 * Reads only the two PUBLIC env vars. The publishable key maps to the Postgres
 * `anon` API role; once a user signs in (anonymously), supabase-js attaches that
 * user's access-token JWT to every request automatically, so the caller becomes
 * the `authenticated` role. Sessions persist through AsyncStorage and refresh
 * automatically; the refresh loop is paused/resumed with app foreground state.
 *
 * Local mode never calls `getSupabase()`, so none of this Auth machinery (or the
 * network) is touched offline. No token or secret is ever logged here.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** True when both public env vars are present. */
export const isSupabaseConfigured = Boolean(url && publishableKey);

function requireConfig(): { url: string; publishableKey: string } {
  if (!url || !publishableKey) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env and set ' +
        'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
        'The publishable key is public by design; the secret key never goes here.',
    );
  }
  return { url, publishableKey };
}

let cached: SupabaseClient<Database> | null = null;

/**
 * The single shared client instance, created lazily on first cloud use. Throws
 * if configuration is missing, so a misconfiguration surfaces at first use.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!cached) {
    const config = requireConfig();
    cached = createClient<Database>(config.url, config.publishableKey, {
      auth: {
        // Persist + refresh the anonymous (and later permanent) session.
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        // On web, auto-process the email-upgrade callback (`?code=`) when the
        // hosted verify endpoint redirects back. No-op on native (no window).
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
        // React Native lock (current Supabase RN guidance) to serialize
        // concurrent token refreshes across tabs/instances.
        lock: processLock,
      },
    });

    // Refresh only while the app is foreground; stop in the background to avoid
    // pointless network churn. Registered once, with the client's creation.
    AppState.addEventListener('change', (state) => {
      if (!cached) return;
      if (state === 'active') cached.auth.startAutoRefresh();
      else cached.auth.stopAutoRefresh();
    });
    cached.auth.startAutoRefresh();
  }
  return cached;
}
