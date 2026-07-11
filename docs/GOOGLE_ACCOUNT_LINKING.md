# Google Account Linking (Phase 5D)

Secure or recover a BrainBrew account with **Google**, preserving the existing
Supabase user identity. **Linking** attaches Google to the *current* user (same
UUID); **sign-in** restores an existing account on a fresh install. No merge, no
password. **All gameplay stays unranked.**

Read [`EMAIL_ACCOUNT_UPGRADE.md`](EMAIL_ACCOUNT_UPGRADE.md) first — the model here
extends it.

> **Status:** the app code, callback handling, account-type sync, and Supabase
> manual-linking are **done and verified**. Enabling the Google **provider**
> (client id + secret) requires the Founder's Google Cloud OAuth client — see
> §1. Until then, `linkIdentity(google)` returns *"Unsupported provider"* (by
> design). The interactive OAuth consent round-trip is Founder/browser-verified.
>
> **Provider-activation gate result (latest run): PROVIDER LIVE — config chain
> verified; interactive consent Founder-verified.** A live read of the BrainBrew
> project (`kfcshiktovyjcoepnrfw`) now shows `external_google_enabled = true` with
> client id + secret set and manual linking on. `linkIdentity(google)` returns a
> real authorization URL to `accounts.google.com/o/oauth2/v2/auth` with the
> correct Supabase callback `redirect_uri`
> (`https://kfcshiktovyjcoepnrfw.supabase.co/auth/v1/callback`), minimal
> `email profile` scopes, and CSRF `state` — verified by
> `npm run cloud:google-check` (10 checks, "provider configured: YES"). The
> **only** remaining step is the human OAuth **consent round-trip** (link,
> recovery, conflict), which cannot be automated (no browser/Google account in
> CI and simulating it is forbidden) — the Founder runs the interactive flows in
> §12. Everything up to Google's consent screen is proven.

---

## 1. Founder setup — Google Cloud + Supabase provider

**These steps require a Google account and cannot be automated.** Secrets go ONLY
into Google/Supabase server config — never into Expo env, source, git, or docs.

### Google Cloud Console
1. Create/select a project → **APIs & Services → OAuth consent screen**.
2. User type **External**; app name **BrainBrew**; support + developer contact
   email; app logo (brand recognizability helps users trust the prompt).
3. Scopes: add only **`.../auth/userinfo.email`** and **`openid`**/**profile**.
   Do NOT add contacts/calendar/Drive/birthday.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized redirect URI: **the Supabase callback**
     `https://kfcshiktovyjcoepnrfw.supabase.co/auth/v1/callback`.
   - (Android client is only needed for a native dev/prod build; deferred.)
5. Copy the **Client ID** and **Client secret**.
6. Publish the consent screen (or add test users) as appropriate. Production
   verification/branding may be required by Google before public launch —
   document as outstanding at launch.

### Supabase (Dashboard → Authentication → Providers → Google)
7. Enable **Google**, paste the **Client ID** and **Client secret**, save.
   (Equivalently via Management API: `external_google_enabled`,
   `external_google_client_id`, `external_google_secret`.)
8. Already done by this phase: **manual linking enabled**
   (`security_manual_linking_enabled = true`), and the redirect allow-list
   includes `http://localhost:8081/**`, `http://localhost:19006/**`,
   `brainbrew://**`. Anonymous + email settings are preserved.
9. Verify with `npm run cloud:google-check` — it reports whether the provider is
   live and confirms manual linking is on.

Production: add the production web origin + native redirect to the allow-list and
Google's authorized redirect list.

## 2. Chosen Expo implementation

`supabase.auth.linkIdentity` / `signInWithOAuth` with `provider: 'google'` and
PKCE, split by platform:

- **Web:** default redirect — supabase-js navigates the browser to Google, which
  returns to the app origin with `?code=`; `detectSessionInUrl` (web) exchanges
  it. No extra dependency.
- **Native:** `skipBrowserRedirect: true` → open the URL with
  `expo-web-browser` `openAuthSessionAsync(url, 'brainbrew://auth-callback')` →
  `exchangeCodeForSession`. `expo-web-browser` (~57) is Expo-Go/dev-build
  compatible.

Rejected: a native Google ID-token SDK (extra native dep, no web support, heavier
for this phase). Scopes are minimal (`email profile`).

## 3. Linking vs sign-in (the core rule)

- **Link** (`linkGoogle`): starts only from a **verified current session**,
  records a pending marker with the current UUID, runs OAuth, and on callback
  asserts the resulting user is the **same UUID**. If it differs → **conflict**,
  no sync, no profile/attempt change. Idempotent if Google is already linked.
- **Sign-in** (`signInWithGoogle`): an **independent** sign-in for recovery,
  never auto-triggered by a conflict; it restores the account attached to that
  Google identity and never merges a current guest.

`AccountMethodService` lives in [`accountUpgrade.ts`](../src/cloud/accountUpgrade.ts)
(extended, single boundary): `getLinkedMethods`, `linkGoogle`, `signInWithGoogle`,
`processAuthCallback` (email + Google), `syncAccountType`, plus the 5C email/
recovery/sign-out. Single-flight guarded; no tokens reach screens.

## 4. Same-UUID invariant & callback lifecycle

The pending-link marker (`{ uid, provider }`, non-sensitive, AsyncStorage) is set
before the redirect and validated after: `processAuthCallback` exchanges the code
(native), reads the user, and **requires `user.id === marker.uid`** before it
syncs or reports `linked`. A different UUID, a reused/expired/malformed callback,
or a cancelled flow all resolve safely without mutating the account. Tokens/codes
are never logged; supabase-js clears the URL.

## 5. Conflict / no-merge policy

- Google already on the **current** user → idempotent `linked`.
- Google on **another** BrainBrew user → callback yields a different UUID →
  **conflict** (`uuid_mismatch`) or `identity_already_exists`; UI shows generic
  "already connected to another account" with *Cancel / different Google / sign
  in*. **No merge, no identity/profile/attempt transfer, current session kept.**
- Matching **email** never authorizes a merge — the explicit UUID-continuity
  check governs, not email equality.

## 6. Account-type synchronization

`sync_account_type()` (from 5C) is **provider-agnostic**: it keys on the verified
`is_anonymous` JWT claim, so ANY permanent identity (email OR Google) yields
`permanent`, and a pending/cancelled link changes nothing. No migration needed.
Client can't set it; profile id, username, country, and attempt ownership are
untouched.

## 7. Profile method UI

Profile reads live Auth identities (`getLinkedMethods`) and shows `✓ Email` /
`✓ Google`. Anonymous → *Secure with email* / *Continue with Google*. Permanent
without Google → *Add Google*. No provider subject ids, tokens, or raw metadata
are shown or stored; email is masked where shown.

## 8. Unlinking — DEFERRED

Not implemented this phase (linking + recovery are the required scope). Rationale:
unlinking adds risk (must never remove the last recovery method, must not
downgrade to anonymous) for little user value now. The `isLastMethod` guard is
already implemented for when it's added. **Decision: defer.**

## 9. Provider privacy

No Google access/refresh tokens or subject ids are stored; only `email profile`
scopes are requested; no provider metadata is persisted or logged; no Google data
is in attempt tokens. Supabase Auth is the identity source of truth.

## 10. Ranked play still disabled

`is_rank_eligible()` stays false for all users; `attempts.is_ranked = false`
DB-enforced. Google identity is a *future* ranked-eligibility input only.

## 11. Test workflow

| Command | Proves |
|---|---|
| `npm run test:cloud` | `linkedMethods`/`isLastMethod` logic (email/google/both/anon), no metadata leak |
| `npm run cloud:google-check` | LIVE: manual linking on, redirect list, `linkIdentity` reachable, sync provider-agnostic; reports provider-config status |
| `npm run cloud:upgrade-check` | same-UUID + no-merge model (shared with email) still holds |

The Google OAuth consent round-trip (link + recovery + conflict) is **Founder/
browser-verified** — it needs a real Google account and the configured provider.

## 12. Interactive / device items (Founder)

- Configure the Google provider (§1), then: anonymous → *Continue with Google* →
  consent → returns → Profile shows Google, same username/country, cloud play
  works. Permanent → sign out → *Continue with Google* → same account restored.
  Conflict: link a Google identity already on another test user → safe conflict,
  no merge. Web at 390px + 320px, no console errors.
## 12a. Android readiness (Samsung S21+ — Founder steps)

The chosen flow is **browser-based OAuth + PKCE** (`linkIdentity`/
`signInWithOAuth` → `expo-web-browser openAuthSessionAsync` on native). It uses
Google's *Web* OAuth client via the Supabase callback, so a separate **Android
OAuth client is NOT required** for this browser flow (an Android client is only
needed for the native Google-Sign-In SDK / ID-token flow, which we deliberately
did not choose).

- **Expo Go vs dev build:** the redirect returns to `brainbrew://auth-callback`,
  which requires the app's own scheme. In **Expo Go** the scheme resolves to an
  `exp://` proxy, so the deep-link return is unreliable — use a **development
  build** (`npx expo run:android` or an EAS dev build) to test on the S21+.
- **Scheme:** `scheme: 'brainbrew'` is already set in `app.config.js`; the callback
  is `brainbrew://auth-callback`. Add that URI (and the Expo dev proxy if testing
  via Expo Go) to the Supabase redirect allow-list (already includes
  `brainbrew://**`).
- **Package identifier:** set `android.package` (e.g. `com.brainbrew.app`) in
  `app.config.js` before an Android build; not needed for the browser flow's OAuth
  client, but required to build the APK and register the deep link.
- **S21+ test:** install the dev build → cloud mode → Profile → *Continue with
  Google* → Chrome Custom Tab consent → returns to the app → Profile shows Google.
  Then sign out → *Continue with Google* → same account restored.

**Do not claim Android success without a real dev build on a real device.** Not
run in this environment.

## 13. Rollback / disable

Disable the Google provider in Supabase (or `external_google_enabled=false`) — the
app's *Continue with Google* then returns a clean "unsupported provider" error and
email/anonymous flows are unaffected. Revert the app to the 5C build if needed;
the Google code is additive.

## 14. Deferred

Apple Sign-In, other providers, unlinking UI, ranked play. The linking model here
is what Apple will reuse.
