# Player Identity & Profiles (Phase 5B)

Durable player identity and basic profiles — **no ranked play yet**. Every
attempt stays unranked (`attempts.is_ranked = false`, DB-enforced).

Read [`SERVER_AUTHORITATIVE_GAMEPLAY.md`](SERVER_AUTHORITATIVE_GAMEPLAY.md) and
[`CLOUD_CLIENT_INTEGRATION.md`](CLOUD_CLIENT_INTEGRATION.md) first.

---

## 1. Anonymous Auth model

In cloud mode the app creates/restores a **Supabase Anonymous Auth** user. Its
`auth.users` UUID is the **canonical player identity**. The old per-install
`guest_<hex>` id is demoted to install metadata (attempt `session_id`) and is
never authority again.

**Anonymous Auth user ≠ the public `anon` API role.** The anonymous user is
*authenticated*: it has an access-token JWT, uses the Postgres `authenticated`
role, and carries `is_anonymous: true` (kept for future ranked eligibility). The
`anon` role is the unauthenticated, publishable-key role — it can read only the
sanitized public surface and no profile.

| | `anon` role (publishable key) | Anonymous Auth user |
|---|---|---|
| Authenticated? | No | Yes (JWT) |
| Postgres role | `anon` | `authenticated` |
| Can read own profile? | No | Yes (RLS) |
| Owns attempts? | No | Yes (`user_id`) |

## 2. Session persistence

The Supabase client (`src/infrastructure/supabase/client.ts`) persists the
session in **AsyncStorage**, auto-refreshes tokens, uses the RN `processLock`,
and pauses/resumes refresh with app foreground state. So the same anonymous user
is restored across restarts. Tokens are never logged. Local mode never
initializes any of this.

## 3. Identity bootstrap

`src/cloud/identity.ts` is the ONLY place that calls `supabase.auth`. States:
`uninitialized → restoring → creating_anonymous_user → ready | error`. A single
in-flight guard collapses concurrent/reload bootstraps, so **one** anonymous user
is ever created. Restore reuses the persisted session; sign-in happens only when
there is none.

## 4. Guest-ID migration decision (Task 3)

The legacy guest id was **never server-verifiable**, so pre-Auth guest attempts
**cannot** be safely claimed — a client could otherwise assert any id and steal
another install's history. Decision: **historical guest attempts are left
unowned**; nothing is relinked. The guest id continues only as the install id
(`session_id` metadata). This is a deliberate security-over-convenience choice.

## 5. Profile schema

`profiles` (migration `20260712091000`): `id` = `auth.users(id)` (cascade delete),
`username`, `username_normalized` (unique, case-folded), `country_code` →
`countries`, `display_country`, `onboarding_status`, `account_type`
(`anonymous`/`permanent`), moderation columns (never client-writable), DB
timestamps. **No sensitive fields** — no birth date, gender, legal name, address,
or phone. One profile per user; the UUID never changes, so identity survives a
future account upgrade.

## 6. Username rules & safety

3–20 chars, ASCII letters/digits/underscore, no leading/trailing/consecutive
underscore (`^[A-Za-z0-9]+(_[A-Za-z0-9]+)*$`). Non-ASCII, control, and invisible
characters are rejected by that class (ASCII-only policy for v1). Case-insensitive
uniqueness via `username_normalized`; display casing preserved. A
`blocked_usernames` table screens reserved (BrainBrew/Admin/Support/…),
impersonation, and a first-pass profanity/slur list — a **table** so moderation
can extend it and force renames later without touching ownership. This is a first
pass; it does not catch all abuse. Availability is advisory — the DB uniqueness
constraint settles races (`set_username` returns `username_taken`).

## 7. Country

Uppercase ISO 3166-1 alpha-2, validated against the canonical `countries` table
(UAE = `AE`, "United Arab Emirates"). Self-reported, low-stakes; **no geolocation
or IP enforcement**. Emoji flags are a client concern, not stored.

## 8. Attempt ownership & trust model

`attempts.user_id` → `auth.users`. Every new cloud attempt requires an
authenticated user; the Edge Functions derive it from the **verified JWT**
(`_shared/auth.ts` → `auth.getUser()`), never from the request body. **Two
independent layers, different boundaries:**

- **Auth JWT** proves the player session (who is calling).
- **HMAC attempt token** authorizes a specific attempt/slot; it now also **binds
  the user id** (`uid`). Every open/submit/complete verifies: valid Auth user,
  token bound to that user, AND the DB attempt row owned by that user. A second
  authenticated user cannot touch the first's attempt (`invalid_token:wrong_user`).

Direct Data API writes to attempts stay blocked (RLS/grants). `user_id` is
nullable only for pre-5B historical rows; when none remain, a follow-up migration
can `SET NOT NULL`.

## 9. RLS & grants (Task 8)

`profiles`: RLS on, `to authenticated using (auth.uid() = id)` for SELECT only —
scoped to the `authenticated` role so a bare `auth.uid()` never matches for the
public `anon` role. **No direct write grant**; all mutations go through validated
SECURITY DEFINER RPCs (which is what enforces "update only permitted fields, never
id/timestamps/moderation"). Anonymous and permanent users both use the
`authenticated` role; the `is_anonymous` claim is available for future rules. A
future PUBLIC profile surface must be a sanitized view/RPC, never this table.

## 10. Onboarding & Profile UI

Cloud start → anonymous session → profile load → if
`onboarding_status ≠ 'complete'` show **Profile Setup** (username + country) →
Home. Profile Setup is NOT account registration; copy explains progress is saved
on this device and permanent linking comes later (no Supabase terminology). The
**Profile screen** shows username, country, account status (Guest/Permanent), edit
username/country, and a "Secure your progress" status row. **Anonymous users get
NO Sign Out** — an anonymous account can't be signed back into, so signing out
would orphan their progress.

## 11. Account-upgrade (email — built in Phase 5C)

Email upgrade is now implemented — see
[`EMAIL_ACCOUNT_UPGRADE.md`](EMAIL_ACCOUNT_UPGRADE.md). An anonymous user secures
progress via `updateUser({ email })` + email-link confirmation, keeping the
**same `auth.users` UUID**, profile, and attempts; `account_type` syncs to
`permanent` only after verification. Google/Apple/phone linking remains deferred.
Future OAuth flows:

- **Anonymous → email / Google / Apple**: `supabase.auth.linkIdentity(...)` (manual
  linking may need enabling in Supabase Auth). This upgrades the *same* user;
  `account_type` flips to `permanent`.
- **Existing-account conflict** (the email/OAuth identity already belongs to
  another user): this is **sign-in to a different account**, NOT a link. Never
  silently merge. Resolution must be explicit (keep current guest, or switch and
  abandon the guest, with a clear warning).
- **Username conflict on merge**: the surviving account keeps its username; the
  other is prompted to rename (moderation/forced-rename columns exist for this).
- **Recovery/rollback**: linking is reversible only before confirmation; after,
  treat as permanent.

No upgrade UI or `linkIdentity` calls exist yet — only the schema and identity
model are ready.

## 12. Rank-eligibility boundary (Task 15)

`is_rank_eligible(user)` exists and **always returns false** this phase (anonymous
AND permanent). Future rules (documented, not enforced): permanent verified
identity, complete profile, valid country, supported app version, no integrity
flags, one ranked attempt per UTC day. No client can set eligibility (it is a
server function), and `attempts.is_ranked = false` stays DB-enforced. No
leaderboard rows are created.

## 13. Test workflow

| Command | Proves |
|---|---|
| `npm run db:auth-test` | profile trigger, username/country RPCs + validation, profile RLS isolation, attempt ownership, `is_ranked` guard (PGlite, mutation-tested) |
| `npm run db:gameplay-sim` | flow ownership: attempt bound to auth user, cross-user token rejected |
| `npm run db:token-test` | token binds the user id (`wrong_user` rejected) |
| `npm run cloud:auth-check` | LIVE anonymous auth: create, restart-restore, profile lifecycle, username uniqueness across users, unauth rejected, ownership, unranked, no leak |
| `npm run cloud:live-check` | LIVE authed gameplay: no wire leak, score matches |

## 14. Real-device checklist (Founder)

Expo Go, `EXPO_PUBLIC_CONTENT_SOURCE=cloud`: anonymous user persists across
restart; profile setup + edits; username taken feedback; country search; unranked
label; no token/answer/secret in a network inspector; local mode still offline.

## 15. Deferred

Permanent-account linking UI, ranked play, streaks, statistics, leaderboards,
friends. The anonymous UUID + unranked model are the seams these build on.

> **Phase 7D note.** Entitlements are keyed to the auth UUID via `auth.uid()`
> (no user parameter). An anonymous → permanent **upgrade keeps the same UUID**,
> so the beta policy carries over unchanged (verified live). The client
> entitlement cache is dropped on any identity change (`continueAsGuest`,
> `signOut`) so a switched player never inherits another's capabilities. See
> [`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md).

## RevenueCat App User ID (Phase 7E)

RevenueCat's App User ID **is** the Supabase Auth UUID — never the install id,
email, or username. Same-UUID upgrades preserve the RevenueCat customer; a user
switch (`continueAsGuest`/`signOut`) calls `RevenueCatService.logOutOrSwitch()` so
User A's purchase state never appears for User B. The webhook validates the App
User ID as a real Auth UUID and quarantines anything else. See
[`REVENUECAT_INTEGRATION.md`](REVENUECAT_INTEGRATION.md) §2.
