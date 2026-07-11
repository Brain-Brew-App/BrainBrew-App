# Email Account Upgrade (Phase 5C)

Let an anonymous player **secure their progress** by attaching an email identity
to their **existing** Supabase user — same UUID, same profile, same attempts. No
second account, no merge. **All gameplay stays unranked.**

Read [`PLAYER_IDENTITY_AND_PROFILES.md`](PLAYER_IDENTITY_AND_PROFILES.md) first.

---

## 1. Chosen mechanism (verified against the live project)

`supabase.auth.updateUser({ email })` on the **current anonymous** user. Supabase
emails a confirmation **link**; opening it verifies email ownership and upgrades
the SAME `auth.users` UUID to permanent (`is_anonymous → false`, an `email`
identity is added). This is the officially supported same-user email association —
**not** `linkIdentity` (OAuth) and **not** an independent signup.

- **Passwordless:** no password is set here. (Password auth is not introduced.)
- **Why the link and not an OTP code:** email-template customization is not
  available on the project's current plan, so the OTP token can't be embedded in
  the email. The default link works out of the box; the app handles the redirect.
- **The same UUID is proven** before/after (`cloud:upgrade-check`).

## 2. Same-UUID invariant

Upgrade never creates a new user. The service refuses to proceed if the current
user isn't authenticated, and the upgrade STATE is derived only from the verified
Auth user (`is_anonymous`, `email`, `new_email`) — never from a client assertion
or from merely sending an email. `cloud:upgrade-check` captures the UUID before
and after and asserts they are identical, and that the profile id and attempt
ownership are unchanged.

## 3. Verification lifecycle & state

Derived from the verified Auth user (no separate persistence needed — the pending
`new_email` and the confirmed `email` live on the Supabase session):

```
idle → requesting → verification_sent → (open link) → completed
                                       ↘ conflict / expired / error
```

`account_type` flips to `permanent` **only** after Auth confirms (JWT
`is_anonymous` becomes false) — never on email entry or send.

## 4. Callback handling

The confirmation link redirects to `emailRedirectTo`:

- **Web:** the app origin (in the redirect allow-list). `detectSessionInUrl` (web
  only) auto-exchanges the `?code=` (PKCE); the identity hook then re-derives
  status and syncs `account_type`.
- **Native:** `brainbrew://auth-callback` (Expo `scheme`). The service exchanges
  the deep-link code (`exchangeCodeForSession`). Native callback delivery is a
  Founder device-verification item.

Callbacks are validated by supabase-js; a bad/expired/reused link yields
`expired`/`error`, never a wrong-account mutation (the code is bound to the local
PKCE verifier). Tokens are never logged and the URL is cleared by supabase-js.

## 5. Account-type synchronization

`sync_account_type()` (SECURITY DEFINER, migration `20260713090000`) reads the
**verified** `auth.jwt() ->> 'is_anonymous'` claim and sets
`profiles.account_type` accordingly — idempotent, per-caller, never client-set.
The identity hook calls it on every profile load, so an upgrade reflects
immediately. Username, country, onboarding, and ownership are untouched.

## 6. Conflict handling

If the email already belongs to another user, `updateUser` fails and the UI shows
generic, **non-enumerating** copy ("That email is already connected to another
BrainBrew account") with only *Use another email* / *Cancel*. **No merge, no
replacement, no attempt transfer.** The DB enforces unique confirmed emails, so a
second user can never attach the same email (`cloud:upgrade-check` proves the
second user keeps its own UUID and the first user's data is untouched). If a
verification link is somehow opened under a different active user, the callback
does not attach/transfer — a safe restart resolves it.

## 7. Existing-account sign-in (recovery)

Passwordless, same method: `signInWithOtp({ shouldCreateUser: false })` sends a
sign-in link. It is **explicit only** (never auto-triggered by a conflict), warns
that signing in switches the device to the existing account and does **not** merge
the current guest, and restores the permanent user's profile + attempts. Auth
bootstrap does not create a replacement anonymous user while sign-in is pending
(the account-entry screen defers bootstrap until *Continue as guest*).

## 8. Permanent sign-out & account entry

Sign-out is offered **only for permanent accounts**, behind a destructive
confirmation that explains local session data is cleared (account/cloud data is
kept). It clears the session + in-memory identity, then shows the **account-entry**
screen (*Sign in with email* / *Continue as guest*) — it never silently creates a
replacement guest. **Anonymous users still get no ordinary Sign Out** (it would
orphan their progress).

## 9. Email privacy & security

Email lives in Supabase Auth only — **never** in the BrainBrew `profiles` table
or any public payload, and **never** in an attempt token. The profile projection
is asserted to contain no `@`. Diagnostics use a masked address (`a•••@g•••.com`);
full emails and callback tokens are never logged. Resend is throttled in the UI
(30s) and requests are single-flighted; Supabase's own rate limits apply.

## 10. Auth configuration (Dashboard/Management API)

| Setting | Value | Why | Verified |
|---|---|---|---|
| Anonymous sign-ins | enabled | anonymous identity (5B) | live probe |
| Email provider | enabled | send the confirmation | config read |
| `mailer_autoconfirm` | **false** | email must be verified (kept ON) | config read |
| `mailer_secure_email_change_enabled` | **false** | an anonymous user has no *old* email to double-confirm; the *new* email is still verified. Re-enable when permanent-user email *changes* are added. | config read |
| `site_url` | `http://localhost:8081` (dev) | callback origin | config read |
| `uri_allow_list` | `localhost:8081/**, localhost:19006/**, brainbrew://**` | permit the redirect targets | config read |

Production launch: add the production web origin + any store deep-link to
`uri_allow_list` and set `site_url`. Email verification (`mailer_autoconfirm=false`)
must stay on.

## 11. Rank eligibility (still disabled)

`is_rank_eligible()` remains **false** for anonymous AND permanent users.
`attempts.is_ranked = false` stays DB-enforced. Permanent identity is documented
as a *future* requirement only; no leaderboard row or ranked attempt is created.

## 12. Test workflow

| Command | Proves |
|---|---|
| `npm run db:auth-test` | `sync_account_type` (pending→anonymous, verified→permanent, idempotent, client-can't-set), continuity of username/country |
| `npm run cloud:upgrade-check` | LIVE: same UUID, same profile/attempts, permanent only after verification, restart restores permanent, conflict = no merge, no email in profile, unranked |
| `npm run cloud:auth-check` / `cloud:live-check` | anonymous auth + authed gameplay still hold |
| `npm run test:cloud` | email validation/normalization/masking (pure) |

Headless email verification is simulated with the admin API
(`updateUserById({ email, email_confirm: true })`) — the exact state the client's
link callback produces — because no test inbox is available in CI.

## 13. Rollback

- **App:** revert to the 5B build; the upgrade UI/service are additive.
- **Auth config:** re-enable `mailer_secure_email_change_enabled` if reverting.
- **Data:** a user who upgraded stays permanent (harmless). To undo a test upgrade,
  delete the auth user (cascades to profile) — never in production.

## 14. Deferred / related

**Google** linking + recovery is implemented in Phase 5D (same-UUID model) —
see [`GOOGLE_ACCOUNT_LINKING.md`](GOOGLE_ACCOUNT_LINKING.md). Apple/phone linking,
password auth, ranked play, streaks, and leaderboards remain deferred.
