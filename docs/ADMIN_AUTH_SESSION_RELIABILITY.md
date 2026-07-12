# Admin Auth & Session Reliability (Phase 7H.1)

Root cause and permanent fix for "login works in Incognito but can fail in the
normal browser."

---

## 1. Root cause — the middleware token-rotation race

The admin used the Supabase SSR middleware pattern to refresh the session, but the
7H `setAll` cookie handler wrote refreshed cookies **only to the response**, not
back to the forwarded **request**. Supabase refresh tokens are **single-use and
rotated** on refresh. So on any request where the access token had expired
(sessions older than the ~1-hour TTL):

1. Middleware `getUser()` refreshed → **rotated** the refresh token → wrote the new
   cookies to the *response*.
2. The **same request's** Server Component render read the **original request
   cookies** (still the old, now-rotated-invalid refresh token).
3. The page's `getUser()` tried to use the old token → failed → `requireAdmin`
   redirected a **valid admin** to `/login`.

- **Incognito**: fresh login, access token valid, no refresh → both middleware and
  page see a valid token → works.
- **Normal browser**: a session older than the access-token TTL triggers the
  refresh+rotation on the next visit → intermittent bounce to `/login`. Exactly the
  Founder's symptom.

## 2. The permanent fix

[`middleware.ts`](../apps/admin/middleware.ts) now follows the official
`@supabase/ssr` pattern: `setAll` writes refreshed cookies to **both** the
forwarded request (so the same-request page render sees the fresh session — no
second refresh, no rotation race) **and** the response (so the browser stores
them). The nonce CSP is preserved.

Belt-and-suspenders:
- **Robust sign-out** ([`login/actions.ts`](../apps/admin/app/login/actions.ts))
  deletes every `sb-*`/`-auth-token` cookie variant (base + chunks), so a stale or
  chunked cookie can never shadow a new session.
- **"Reset session"** recovery link on `/login` clears stale cookies **without
  needing a valid session** — the supported one-click fix for a corrupted cookie,
  **not** "clear all browser data".
- **Account-mismatch page** (`/account`): a signed-in non-admin gets a clear
  "sign out and use another account" instead of a redirect loop; sessions never
  auto-switch, and User A's admin context never persists into User B's session
  (role resolved from `admin_role_of`, active-only, every request via the
  request-memoized context).

## 3. The Vercel token is unrelated (proven)

The Founder suspected the Vercel deployment token. It is **not** involved in
runtime auth:
- The Vercel token is used only by the deploy CLI/API at build/deploy time; it is
  **never** a Vercel runtime environment variable and is never read by the admin
  server code. Runtime env is only `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SECRET_KEY`, `SUPABASE_PROJECT_REF`.
- Admin auth is **Supabase Auth cookies** on `admin.brainbrew.dev`, issued by
  Supabase — independent of any Vercel token.
- **Revoking the Vercel token does not revoke Supabase user sessions.** No deploy
  script deletes or alters Supabase auth cookies. Editor/CI deploy activity cannot
  control Founder login.

The correlation the Founder saw was coincidental timing; the real cause was the
cookie-rotation race above.

## 4. Normal vs Incognito

Both a persistent-storage (normal) browser and a fresh (incognito) context now
succeed for a valid admin, across an expired/aged session, because the refreshed
session propagates within the request. If a browser still holds a corrupted legacy
cookie, one click of **Reset session** clears it.

## 5. Recovery states

`/login` shows calm notices for signed-out / reset / expired. `/account` handles
the signed-in-but-not-admin case. No raw Supabase errors are shown.

## 6. Diagnostics

Auth-failure logging is server-only and privacy-safe (stage, safe code, host,
route, whether a session/user/admin resolved, duration) — never tokens, cookies,
PKCE verifier, authorization code, or raw payloads.
