// ESLint (flat config) — added in Phase 7K release hardening.
//
// The project had NO linter, so a whole class of defect (unused vars, unreachable
// code, async races on shared values, console output shipping to users) was never
// caught mechanically. This is the Expo baseline plus the rules that map to failure
// modes that actually matter in a release candidate.
//
// Scope is the PLAYER APP (src/, App.tsx, index.ts). Node tooling (scripts/), the
// Deno Edge Functions (supabase/) and generated bundles are excluded — different
// runtimes/globals, and they have their own gates.
// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      '.expo/*',
      'scripts/*',                  // Node tooling, own conventions + own gates
      'supabase/*',                 // Deno runtime, different globals
      'src/content/generated/*',    // generated bundle
      'admin/*',                    // separate, frozen platform
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'App.tsx', 'index.ts'],
    rules: {
      // ── Correctness: these are real defects, so they fail the gate. ──────────
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none',
      }],
      'react-hooks/rules-of-hooks': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-constant-condition': 'error',
      'no-async-promise-executor': 'error',
      'no-promise-executor-return': 'error',

      // A missing dep is usually a stale-closure bug — but several of ours are
      // deliberate (identity-guarded loaders carrying an explicit eslint-disable).
      // Warn so they surface without blocking the gate on a false positive.
      'react-hooks/exhaustive-deps': 'warn',

      // ── Two React-19 compiler rules, deliberately WARN, not error ───────────
      //
      // 'react-hooks/refs' fires 55× on `useRef(new Animated.Value(x)).current` —
      // which is the idiom React Native's own documentation prescribes. The rule is
      // written for React-Compiler memoization semantics; in RN the Animated.Value
      // is a stable mutable handle that never participates in render output. The
      // real (tiny) cost is that the constructor runs each render and the result is
      // discarded. Converting 55 call sites across every animated component the
      // night before an RC — with no way to regression-test each animation visually
      // — is a worse risk than the allocation. Tracked in KNOWN_LIMITATIONS.md.
      // (Where it flagged genuinely impure render work — useElapsed's Date.now() —
      // it was fixed rather than suppressed.)
      'react-hooks/refs': 'warn',
      //
      // 'react-hooks/set-state-in-effect' fires on the cloud hooks' `setPhase('loading')`
      // at the top of a load effect. That costs one extra render pass on mount; it is
      // not a correctness bug, and the alternative (deriving phase during render)
      // would be a larger rewrite of five data hooks. Left visible as a warning.
      'react-hooks/set-state-in-effect': 'warn',

      // A DOM rule. RN <Text> renders an apostrophe literally; there is nothing to
      // escape and no HTML-injection surface.
      'react/no-unescaped-entities': 'off',

      // Anything not behind __DEV__ ships to users' logcat.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]);
