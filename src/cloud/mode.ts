/**
 * Content-mode configuration — the ONE place the app decides local vs cloud.
 *
 * `EXPO_PUBLIC_CONTENT_SOURCE` selects the gameplay source: `local` (bundled
 * library, the default and preserved offline fallback) or `cloud` (the
 * server-authoritative Edge Functions). Every other module consumes the typed
 * `ContentConfig` from here rather than reading the environment itself, so mode
 * logic lives in exactly one file.
 *
 * The parsing/validation is pure (env is passed in) so it is unit-testable in
 * plain Node; `contentConfig()` is the thin wrapper that reads the real env.
 * No key or secret is ever printed here.
 */

export type ContentMode = 'local' | 'cloud';

export interface ContentEnv {
  EXPO_PUBLIC_CONTENT_SOURCE?: string;
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface ContentConfig {
  mode: ContentMode;
  /** True only in cloud mode with both public Supabase vars present. */
  supabaseReady: boolean;
}

/**
 * Parse the raw flag into a mode. Unset/empty → `local`. `cloud` → `cloud`.
 * Anything else is a misconfiguration: throw in development so it is caught
 * immediately; in production fall back to `local` rather than crash a build.
 */
export function parseContentMode(raw: string | undefined, isDev: boolean): ContentMode {
  const value = (raw ?? '').trim();
  if (value === '' || value === 'local') return 'local';
  if (value === 'cloud') return 'cloud';
  if (isDev) {
    throw new Error(
      `Invalid EXPO_PUBLIC_CONTENT_SOURCE="${value}". Allowed values: "local" or "cloud".`,
    );
  }
  return 'local';
}

/**
 * Resolve the full config from an env object. In cloud mode the two public
 * Supabase vars are required; a missing one throws in development (a silent
 * fallback to local would masquerade a cloud build as working).
 */
export function resolveContentConfig(env: ContentEnv, isDev: boolean): ContentConfig {
  const mode = parseContentMode(env.EXPO_PUBLIC_CONTENT_SOURCE, isDev);
  const supabaseReady = Boolean(env.EXPO_PUBLIC_SUPABASE_URL && env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (mode === 'cloud' && !supabaseReady && isDev) {
    throw new Error(
      'EXPO_PUBLIC_CONTENT_SOURCE=cloud requires EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Set them, or use the local source.',
    );
  }
  return { mode, supabaseReady };
}

// The concrete `contentConfig()` that reads the real environment lives in
// `env.ts` — Metro only inlines LITERAL `process.env.EXPO_PUBLIC_*` reads, and
// this module stays pure so plain Node can unit-test the parsing above.
