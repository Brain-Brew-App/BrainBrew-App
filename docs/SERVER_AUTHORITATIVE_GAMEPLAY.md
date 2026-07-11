# Server-Authoritative Gameplay (Phase 4B)

The first secure cloud gameplay path for BrainBrew: the app fetches only
sanitized public content, plays through the server, and the **server** — never
the client — holds the answer key and computes the score.

This document is the reference for that path: the security model, the attempt
lifecycle, the token design, scoring, and the exact runbook to deploy it. Read
[`CORE_SPEC.md`](CORE_SPEC.md) §8–§10 (scoring, anti-cheat, incidents) and
[`DATABASE_FOUNDATION.md`](DATABASE_FOUNDATION.md) (the schema and RLS) first.

> **Status (Phase 4B): UNRANKED.** Every attempt in this document's flow is
> `is_ranked = false`. Ranked play is added in **Phase 6A** — see
> [`RANKED_DAILY_ATTEMPTS.md`](RANKED_DAILY_ATTEMPTS.md) — which reuses this exact
> secure path (open → submit → server-scored) and adds a server-authoritative,
> one-per-day, immutable ranked BrewScore on top. This is still not a leaderboard:
> Phase 6A produces a single secure result, not standings.
>
> **Phase 7B update.** Unranked **reserve-based Practice** reuses this same
> open/submit/complete flow — the only change is *polymorphic slot resolution*
> (`resolveSlot`/`resolveSlotPublic` read `practice_pack_slots` for a practice
> attempt, else `daily_pack_slots`). The attempt token binds to the practice pack,
> so a ranked token can never open a practice slot or vice versa. See
> [`RESERVE_BASED_PRACTICE.md`](RESERVE_BASED_PRACTICE.md).

---

## 1. The security model

Two keys, two roles, one hard boundary:

| Key | Postgres role | Who holds it | Can read answers? |
|-----|---------------|--------------|-------------------|
| `sb_publishable_…` | `anon` (RLS applies) | the Expo app, publicly | **No** |
| `sb_secret_…` | `service_role` (BYPASSRLS) | the Edge Functions + tooling | Yes |

The publishable key proves only *"a BrainBrew app is calling."* It is **not**
identity — it cannot say "this session owns attempt X". That is what the signed
[attempt tokens](#3-attempt-tokens) are for.

> **Phase 5B update.** `start-attempt`/`open-puzzle`/`submit-answer`/
> `complete-attempt` now require a **Supabase Auth session** (anonymous is fine):
> the function verifies the JWT (`_shared/auth.ts`), derives `auth.users.id`
> server-side, sets `attempts.user_id`, and binds the attempt token to that user.
> `get-daily-pack` stays public. See
> [`PLAYER_IDENTITY_AND_PROFILES.md`](PLAYER_IDENTITY_AND_PROFILES.md).

The client may hold **only** `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. It never receives a secret key, a
service-role key, a database URL, or a private answer payload.

### The public read surface is a function, not a table

`anon` can execute exactly one thing: the `get_public_pack(date)` SECURITY
DEFINER function ([migration](../supabase/migrations/20260711090000_public_surface_rpc.sql)).
It:

- returns only render-safe columns — no answers, seeds, validation, reviews,
  hashes, drafts, or reserve;
- filters to a **live, past-or-today, non-voided** pack (never a future pack);
- has a **pinned `search_path`** (the advisor flags mutable ones);
- touches no base table `anon` can reach — the base tables stay `REVOKE`d.

The answer key lives in a **separate table** (`puzzle_answers`) that `anon` is
never granted, not in a hidden column. The boundary is structural.

---

## 2. The attempt lifecycle

Five Edge Functions ([`supabase/functions/`](../supabase/functions)), each a thin
Deno HTTP wrapper over the shared, DB-agnostic flow in
[`_shared/gameplay.ts`](../supabase/functions/_shared/gameplay.ts):

```
get-daily-pack   → sanitized public pack for a date (no attempt needed)
start-attempt    → create an attempt, return an attempt token
open-puzzle      → start the SERVER timer for one slot, return an open token
submit-answer    → score the raw submission against the private key, reveal result
complete-attempt → sum the server-awarded scores into the final BrewScore
```

The client works in **positions (1–5)**; the server maps position → slot uuid.
The client never needs a slot id or a pack id.

Key invariants (all enforced by the DB schema *and* the flow):

- **Timing is server-set.** `open-puzzle` records `opened_at`; `submit-answer`
  measures `elapsed = submit_time − opened_at`. The client's reported time is
  never authoritative. Re-opening a slot does **not** reset the timer.
- **One submission per slot.** A unique `(attempt_id, slot_id)` and an
  immutability trigger make a second or altered submission impossible.
- **A completed attempt is terminal.** No new items, no score change.
- **A voided slot can never be opened**, and is invisible in `get_public_pack`.

---

## 3. Attempt tokens

[`_shared/token.ts`](../supabase/functions/_shared/token.ts). Format:
`base64url(payloadJSON).base64url(HMAC-SHA256)`, via Web Crypto (identical in
Deno and Node, so the [test](../scripts/db/token-test.mjs) exercises the real
code).

Two types from one signer:

- **`attempt`** token — issued by `start-attempt`, bound to
  `(attemptId, sessionId, packId)`, TTL 2h. Required by open/complete.
- **`open`** token — issued by `open-puzzle`, additionally bound to one
  `slotId`, TTL 10m. The only thing `submit-answer` accepts.

Every payload carries `iat`, `exp`, and a random `nonce`. Verification is
constant-time (`crypto.subtle.verify`) before any claim is trusted, and checks
type, attempt, session, and slot bindings.

The token is **not** the last line of defence — the DB constraints independently
reject replays. The token stops a forged request before it reaches them. Defended
cases (all tested): tampered body, wrong secret, expiry, not-yet-valid, wrong
type/attempt/session/slot, malformed input.

The signing secret is `ATTEMPT_TOKEN_SECRET` (≥32 chars), a **function secret**,
never in the client and never logged.

---

## 4. Scoring

The canonical point math (`14 accuracy + 6 speed = 20/puzzle`, `100` max) lives
in [`src/scoring/points.ts`](../src/scoring/points.ts). The server mirrors it in
[`_shared/points.ts`](../supabase/functions/_shared/points.ts) (self-contained so
it bundles into an Edge Function).

The crucial difference from the app scorer: a cloud client submits its **raw**
input — which tiles it tapped, which order it placed — never a derived accuracy,
because it never learns which tiles are targets. The server
([`_shared/scoring.ts`](../supabase/functions/_shared/scoring.ts)) derives
accuracy from the raw input plus the private key, then awards points.

Two contract tests keep the two implementations from diverging:

- [`scoring-contract.mjs`](../scripts/db/scoring-contract.mjs) — proves the two
  `points.ts` files agree across a grid, and that for **all 314 puzzles** the
  server `scoreSubmission` awards identical points/verdict to the app
  `scorePuzzle` for the same play and server-set time.
- [`gameplay-sim.mjs`](../scripts/db/gameplay-sim.mjs) — runs the real flow
  against PGlite with real content and cross-checks every scored slot against the
  app scorer, end to end.

The **explanation** is private (in `puzzle_answers`) and is revealed only in the
`submit-answer` response — after the answer is committed, never before.

---

## 5. Incidents & voids

A voided slot (Core Spec §10) is removed from scoring: it cannot be opened, it is
hidden from `get_public_pack`, and `complete-attempt` sums only submitted items.
The attempt model reserves `status = 'invalidated'` and `cheat_flags` for
later incident handling; this phase does not populate them automatically.

---

## 6. Observability

Errors return a **stable, non-sensitive `code`**
([`_shared/http.ts`](../supabase/functions/_shared/http.ts)) — e.g.
`no_live_pack`, `slot_voided`, `already_submitted`, `invalid_token:expired`,
`invalid_submission:expected_selectedId`. No secret, stack, answer, or full
payload is ever put in an error body or a log line. Unexpected errors collapse to
`internal_error` with the detail kept server-side.

---

## 7. Client integration & the local fallback

`EXPO_PUBLIC_CONTENT_SOURCE` selects the gameplay source
([`src/data/contentSource.ts`](../src/data/contentSource.ts)):

- **`local`** (default) — the bundled library. The app ships and behaves exactly
  as before; local gameplay is the preserved fallback.
- **`cloud`** — the server-authoritative path via
  [`gameplayClient.ts`](../src/infrastructure/supabase/gameplayClient.ts), which
  calls the five functions with the publishable key only and holds tokens + raw
  submissions, never an answer.

`cloud` requires the two public env vars; `assertContentSourceReady()` fails loud
at startup if they're missing rather than silently serving an empty pack.

> **UI integration status.** As of **Phase 5A** the cloud path IS wired into the
> app UI behind `EXPO_PUBLIC_CONTENT_SOURCE=cloud`, through the `GameplayService`
> boundary and `useGameplaySession` — see
> [`CLOUD_CLIENT_INTEGRATION.md`](CLOUD_CLIENT_INTEGRATION.md). The screens and
> engines render both modes; local remains the default. An interactive browser
> click-through remains a Founder verification item; the wire itself is proven
> headlessly by `npm run cloud:live-check`.

---

## 8. Remote runbook

Prerequisites: the Supabase CLI, and privileged credentials in an **ignored**
`.env.db.local` (never committed) — see [`.env.example`](../.env.example) and
`.env.db.local.example`. Required: `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD`, `SUPABASE_SECRET_KEY`, and a strong `ATTEMPT_TOKEN_SECRET`.

Run these from `brainbrew-app/`, in order. **Before anything remote**, prove no
credential was ever committed:

```bash
npm run secret-scan
git log -p | grep -Ei 'sb_secret_|sbp_|service_role' && echo "STOP: credential in history" || echo "clean"
```

Then:

```bash
# 1. Link the local repo to the project (uses SUPABASE_ACCESS_TOKEN).
npm run supabase:link                     # supabase link --project-ref kfcshiktovyjcoepnrfw

# 2. Push migrations (creates schema, RPC, attempts, publish_pack).
npm run supabase:push                     # supabase db push

# 3. Import canonical content, idempotently (SECRET key). Run twice to prove idempotency.
npm run supabase:import-content
npm run supabase:import-content

# 4. Generate types from the LIVE schema (overwrites the hand-authored stand-in).
npm run supabase:types
npm run typecheck                         # must stay green against generated types

# 5. Verify local↔cloud parity by content hash.
npm run supabase:parity

# 6. Set the token secret, then deploy the five functions.
supabase secrets set ATTEMPT_TOKEN_SECRET=<64+ random hex>
npm run supabase:deploy-functions

# 7. Publish a controlled set (7–14) of dated packs.
npm run supabase:publish-packs -- --count 10

# 8. Cloud end-to-end smoke test: with EXPO_PUBLIC_CONTENT_SOURCE=cloud, play a
#    full pack in the app and confirm the score matches a local play.
```

Each script runs a **dry run** (no connection) when the secret key is absent, so
every step is safe to inspect first.

> **Do not claim completion of the remote deploy until steps 1–8 have actually
> run and passed.** Everything in §1–§7 is verified locally (PGlite + the
> contract/sim tests); the remote deploy is verified only when the commands above
> succeed against the managed project.

---

## 9. What is intentionally NOT here

- **No ranked play.** All attempts are unranked (§ status note).
- **No accounts.** `session_id` groups a device's attempts; `user_id` is reserved.
- **No client-side scoring in cloud mode.** The client submits raw input and
  receives a result; it never computes points or sees an answer key.
