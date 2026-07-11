# BrainBrew — Database Foundation (Phase 4A)

The secure, version-controlled Supabase foundation for BrainBrew's approved
content, and how the existing local library maps into it. Migrations are the
source of truth; the Dashboard is not.

**This phase ships schema + content only.** No accounts, no leaderboards, no
realtime, no server-authoritative scoring. The local app is unchanged and stays
fully playable offline — nothing in the running app talks to Supabase yet.

> **Superseded in parts by Phase 4B** — see
> [`SERVER_AUTHORITATIVE_GAMEPLAY.md`](SERVER_AUTHORITATIVE_GAMEPLAY.md). Two
> facts below changed:
> 1. The public read surface is no longer the `public_pack_slots` **view** — it
>    was replaced by the `get_public_pack(date)` SECURITY DEFINER **function**
>    (smaller attack surface; anon executes one function and can reach no base
>    table). Where this doc says "public via view", read "public via the RPC".
> 2. The `attempts` / `attempt_items` tables are no longer deferred — they now
>    exist (function-only; denied to anon), alongside `publish_pack`. Attempts
>    remain **unranked** this phase.

---

## 1. Purpose and boundaries

The database is the future home of BrainBrew's **approved content platform**: the
engine registry, the private authoring seeds, the built puzzles (split into
public render data and private answers), validation evidence, human reviews, and
the immutable daily packs.

What it is **not**, this phase: gameplay state, attempts, scores, users,
leaderboards, or any live read path for the app. Those arrive later, behind
server-authoritative scoring.

**Local vs cloud roles right now:**

| | Local library (`src/content`, `src/data`) | Supabase |
|---|---|---|
| Authoritative for gameplay | ✅ yes | ❌ no (verification-only) |
| Holds answers | ✅ (client-side, pre-cloud) | ✅ (private table, never served) |
| Source of the import | ✅ | receives it |

---

## 2. Table inventory

| Table | Visibility | Holds |
|---|---|---|
| `puzzle_engines` | private | the Engine Registry (§3): 15 engines, metadata, rotation params |
| `puzzle_seeds` | **private** | authoring inputs (the structured seed) |
| `puzzles` | private base / public via view | render-safe puzzle content — **no answer** |
| `puzzle_answers` | **private** | the answer key + explanation, in a separate table |
| `puzzle_validation_results` | **private** | evidence each puzzle passed its validator |
| `content_reviews` | **private** | human review decisions |
| `daily_packs` | private base / public via view | the immutable pack templates |
| `daily_pack_slots` | private base / public via view | the five ordered category slots |
| `public_pack_slots` (view) | **public (anon read)** | the only client-readable object: live packs, sanitized |

Deliberately **not created** (deferred): `attempts`, `attempt_answers`,
`leaderboards`, `friendships`, `subscriptions`, `tournaments`, `profiles`, any
analytics table. No speculative empty tables (Task 3).

---

## 3. Relationships

```
puzzle_engines ──1:N── puzzle_seeds ──1:1── puzzles ──1:1── puzzle_answers   (private)
       │                                       │  │
       │                                       │  └──1:N── puzzle_validation_results (private)
       │                                       └─────1:N── content_reviews            (private)
       │
       └──1:N── daily_pack_slots ──N:1── daily_packs
                       │
                       └──N:1── puzzles     (a scheduled puzzle; globally unique across slots)

public_pack_slots  =  view over (daily_packs ⋈ daily_pack_slots ⋈ puzzles), live + sanitized
```

- Each engine belongs to exactly one **category** (`puzzle_engines.category`), and
  a puzzle's category must equal its engine's (trigger).
- A puzzle has exactly one seed and at most one answer row.
- A pack has exactly five slots; a puzzle appears in **at most one** slot ever.

---

## 4. Public vs private data classification

| Data | Class | Where |
|---|---|---|
| Prompt, render payload, difficulty, timing | public | `puzzles.public_payload`, exposed via the view |
| **Correct answer / answer key** | **private** | `puzzle_answers.answer_payload` |
| **Explanation** (revealed only after answering) | **private** | `puzzle_answers.explanation` |
| **Authoring seed** | **private** | `puzzle_seeds.payload` |
| Validator findings, validation hashes | private | `puzzle_validation_results` |
| Reviewer notes, confidence, decisions | private | `content_reviews` |
| Draft / rejected / retired content | private | never in the public view (filtered to `status='live'`/`'approved'`) |
| Reserve (unscheduled) puzzles | private | exist in `puzzles`, absent from every slot |
| Approval metadata (`approved_at`, statuses) | private | base tables only |

### The public/private boundary

The split is **structural, not incidental**. The answer is not an unselected
column — it lives in a separate table (`puzzle_answers`) the anon role is never
granted. Even a mistaken future `SELECT *` on `puzzles` cannot return an answer,
because the answer is not there.

The split is computed once, from a single descriptor
(`src/infrastructure/supabase/publicFields.ts`, `ENGINE_SPLIT`). For each engine
it names the answer fields to strip, and — for Symbol Sweep / Rapid
Classification, whose answer lives *inside* a render array — the sub-field to
remove from each element (`isTarget`, `bucket`). The importer applies it and
asserts no leak; a database test re-checks every stored payload.

> **Memory Flash caveat.** Its answer (which board tiles were the shown targets)
> is derivable from what the player is shown during the exposure — that is the
> whole game. So its public payload legitimately contains enough to derive the
> answer. The canonical `targetIds` are still stored privately for a clean
> record; hiding them from the payload would not add security, because the
> exposure already reveals them. Server-authoritative scoring still validates the
> submission; the "secret" is the player's memory, not hidden data.

### The later server-authoritative flow (not built yet)

```
Client requests today's public pack   → GET public_pack_slots (render-safe, no answers)
Client submits an answer + attempt token
Server validates and scores privately (reads puzzle_answers with the secret key)
Server returns the result and the explanation
```

There is no fake "secure" path where the answer arrives inside a hidden client
payload. The public surface has no answer to hide.

---

## 5. Lifecycle / status values

**Seed** `draft → validated → approved → rejected → retired`
**Puzzle** `draft → validated → approved → retired`
**Pack** `draft → testing → approved → live → archived`
**Incident** (`daily_packs.incident_status`) `none → level_1 → level_2 → level_3` (Core Spec §10)

Imported content lands as: puzzles **approved**, packs **approved** with
`pack_date = NULL`. Approved means assembled + validated, but not yet published
to a calendar date. Publishing (assigning a date, flipping to `live`) is a later
phase, behind server-authoritative scoring.

### Immutable fields / rules

- A **live** or **archived** pack's slot membership is immutable (trigger).
- A slot's puzzle can never be substituted during a **void** (trigger, any status).
- A **voided** slot is terminal — it cannot be un-voided (trigger).
- `puzzle_id` and `seed_id` are globally unique (primary keys).
- `pack_date` is unique when set — one canonical pack per UTC date.

### The content approval boundary

A puzzle **cannot become `approved`** unless it has (a) a passing
`puzzle_validation_results` row and (b) an answer row (trigger). A pack **cannot
become `approved`/`live`/`archived`** unless it has exactly five slots in the
fixed category order (trigger). A slot **cannot reference a non-approved puzzle**
(trigger). Together: nothing schedulable is unvalidated, and nothing published is
incomplete.

---

## 6. RLS and grants model

The publishable key runs as the Postgres **`anon`** role, so RLS + grants are the
real protection (the "the client doesn't normally query that" assumption is never
relied on).

- **Every base table**: RLS enabled, **no policy** ⇒ deny-all for anon /
  authenticated. No `using (true)` anywhere.
- **Grants**: `REVOKE ALL` from anon / authenticated on every base table; the
  crown jewels (`puzzle_answers`, `puzzle_seeds`, `content_reviews`,
  `puzzle_validation_results`) are revoked again, explicitly.
- **Public read**: `GRANT SELECT` to anon on the sanitized `public_pack_slots`
  view only. The view is owned by `postgres` and filters to `status='live'` and
  `pack_date <= today` and non-voided slots, and its SELECT list contains no
  answer column — so it is airtight by construction.
- **Client writes**: none, anywhere, this phase.
- **Privileged tooling**: uses the **secret key** (service_role, bypasses RLS),
  outside the app.

Proven in `npm run db:test` (against the real migrations, in PGlite): anon is
denied `puzzle_answers`, `puzzle_seeds`, `content_reviews`, and the `puzzles`
base table; anon can read the view; the view has no answer column; a future-dated
live pack is invisible; service_role can read answers.

---

## 7. Migration workflow

Migrations in `supabase/migrations/` are the source of truth, applied in
timestamp order:

| File | Contents |
|---|---|
| `…120000_content_schema.sql` | enums, all tables, constraints, indexes, `updated_at` |
| `…120100_integrity_triggers.sql` | cross-table invariants (category, approval, completeness, immutability, void) |
| `…120200_public_surface.sql` | the sanitized `public_pack_slots` view |
| `…120300_rls_grants.sql` | RLS enable + revokes + the single view grant |

**Applying them** (Founder, with credentials — Docker not required):

```bash
npm run supabase:link      # one-time; prompts for the access token
npm run supabase:push      # applies migrations to the remote
```

Never make schema changes only in the Dashboard. If the remote is ever ahead,
`supabase db pull` a migration first and reconcile, rather than resetting.

> **Remote status as of this phase:** the project (`kfcshiktovyjcoepnrfw`) was
> empty (all tables 404 to the anon key). Nothing to reconcile.

---

## 8. Content-import workflow

The importer builds every row from the local canonical content (one source:
`scripts/db/build-rows.mjs`), preserving stable ids, categories, difficulty,
public/private split, explanations, statuses, pack order, reserve state, and
content hashes.

```bash
# DRY RUN — builds rows, checks no answer leaks, connects to nothing:
npm run supabase:import-content -- --dry-run

# LIVE — requires the SECRET key (never committed), in your shell:
SUPABASE_SECRET_KEY=sb_secret_… EXPO_PUBLIC_SUPABASE_URL=… \
  npm run supabase:import-content
```

Properties:
- **Idempotent** — upsert on stable keys; a second run changes nothing.
- Puzzles are inserted `draft`, then approved once their answer + validation
  exist (respecting the approval trigger).
- Published-pack mutation is blocked by the database, not just the tool.
- Summarizes ok / failed per table; never logs an answer payload or a credential.
- Refuses to run with the publishable key.

**Local proof it works** (no remote needed): `npm run db:import-check` loads all
314 real puzzles and 50 real packs into PGlite through the same upsert path and
asserts clean, idempotent import with the reserve preserved and no answer leak.

---

## 9. Local ↔ cloud parity strategy

```bash
npm run supabase:parity           # offline self-consistency if no secret key
SUPABASE_SECRET_KEY=… EXPO_PUBLIC_SUPABASE_URL=… npm run supabase:parity   # full
```

Compares by **content hash**, not counts (counts can match while content is
wrong): 15 engines, 314 puzzle hashes, 50 pack hashes, 250 scheduled, 64 reserve
unscheduled. Separately reads the public surface with the **publishable** key to
confirm it exposes no answer field and that anon is denied the answer table.
Exits non-zero on any mismatch.

---

## 10. Generated-types workflow

`src/infrastructure/supabase/database.types.ts` is the typed schema the client
and mappers compile against.

> **This file was authored from the migrations in this phase, not generated from
> a live database** — generating requires a privileged credential the Founder
> holds. It is a faithful transcription of the committed DDL. Regenerate it once
> credentials exist:

```bash
npm run supabase:types    # supabase gen types typescript --project-id … > database.types.ts
```

The generated output overwrites this file; the shapes should match, and
`npm run db:test` guards the schema it describes. Database types never leak past
`mappers.ts` — the domain types in `src/types/puzzle.ts` stay authoritative for
gameplay.

---

## 11. Backup / rollback considerations

- **Rollback** is by forward migration (a new timestamped file that reverses),
  never by editing an applied migration. Supabase retains automatic backups on
  the managed project.
- **Import** is idempotent and non-destructive: re-running upserts, never
  deletes. It cannot mutate a published pack (trigger).
- **Content reserve** (64 puzzles) is never scheduled and never re-shown, so it
  is safe to re-import.
- Before any destructive remote operation, Founder approval is required; this
  phase performed none.

---

## 12. Deferred tables and features

Explicitly out of scope, no stubs created: attempts & scoring, accounts/auth,
leaderboards, friends/teams, tournaments, subscriptions, realtime, edge
functions, analytics, admin dashboard, AI generation, push, sharing, and any
live gameplay read path.

---

## 13. Repository boundary

`src/data/repositories.ts` defines `EngineRepository`, `ContentRepository`,
`DailyPackRepository`. The **local adapter is the active gameplay source** and
delegates to the existing functions (no behaviour change). The Supabase adapter
(`src/infrastructure/supabase/supabaseRepositories.ts`) is **verification-only**:
it reads engine metadata and the sanitized public surface, and its
`getScorablePuzzle` returns `null` — it cannot reconstruct a scorable puzzle
because the cloud never sends the answer. It becomes a gameplay source only after
server-authoritative scoring exists.

---

## 14. Open risks and decisions

1. **Types are transcribed, not generated** (no access token). Guarded by
   `db:test`; regenerate with `supabase:types` when possible.
2. **The remote was not migrated or imported here** — no privileged credential
   was available in this phase. All artifacts are built and locally verified
   (32 db checks + 17 import checks in PGlite against the real migrations). The
   Founder runs `supabase:link` → `supabase:push` → `supabase:import-content` →
   `supabase:parity`.
3. **Pack ↔ date model.** Local packs are 50 cyclic templates; the DB models one
   canonical pack per date. Imported packs are dated `NULL` (approved templates);
   date assignment + `live` is a later phase. This is the one intentional
   semantic shift at the boundary.
4. **PGlite ≠ Supabase Postgres exactly.** The harness mirrors the platform roles
   (incl. `service_role BYPASSRLS`), but it is not the managed instance. The
   migrations use only core Postgres features; still, `db:push` on the real
   project is the final confirmation.

---

## Entitlements (Phase 7D)

The entitlement foundation deliberately adds **no table**. `get_my_entitlements()`
(migration `20260720090000_entitlements.sql`) is a SECURITY DEFINER, STABLE,
parameter-less, `authenticated`-only function that returns the constant **beta
policy** for every player — so a `player_entitlements` table would be empty and add
no present value. It is introduced only when a future payment-provider webhook must
*persist* real per-player state (read it in the function, fall back to `beta` on a
missing row — additive, no contract change). The ranked-attempt limit is a hard
constant `1`, never a column. See
[`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md) §4 and
[`PREMIUM_PRODUCT_MODEL.md`](PREMIUM_PRODUCT_MODEL.md) §6.

## RevenueCat subscription tables (Phase 7E)

7D's "no table" note is superseded: 7E added three private, RLS-enabled (no-policy)
tables — `player_entitlements` (one canonical row/user, provider-synchronized, no
receipts/cards/secrets/customer-ids), `revenuecat_webhook_events` (idempotency +
audit; hashed app-user fingerprint only, no payload), and the singleton
`release_policy` (mode switch). Writes go only through service-role SECURITY
DEFINER RPCs (`sync_player_entitlement`, `claim_webhook_event`,
`finish_webhook_event`, `set_release_policy`); all pin `search_path`. See
[`REVENUECAT_INTEGRATION.md`](REVENUECAT_INTEGRATION.md).
