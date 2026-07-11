# Daily Global & Country Leaderboards (Phase 6C)

Trustworthy daily rankings derived **entirely** from valid, completed, clean
ranked attempts (Phase 6A). This phase is *only* Global and Country daily
leaderboards: no friends, teams, tournaments, streaks, weekly/monthly/all-time
boards, or statistics. It adds no gameplay, scoring, or anti-cheat — it is a
sanitized read surface over the server-authoritative ranked records.

Read [`RANKED_DAILY_ATTEMPTS.md`](RANKED_DAILY_ATTEMPTS.md) (the ranked records
this ranks), [`SERVER_AUTHORITATIVE_GAMEPLAY.md`](SERVER_AUTHORITATIVE_GAMEPLAY.md),
and [`DATABASE_FOUNDATION.md`](DATABASE_FOUNDATION.md) first.

> **Deferred (not built):** Friends leaderboards, private groups, teams,
> multiplayer, tournaments, weekly/monthly/all-time rankings, long-term stats,
> achievements. The client shows **no** dead "Friends" tab.

---

## 1. What appears on a leaderboard

A row is included only when its ranked attempt is **all** of:

- `is_ranked = true`
- `status = 'completed'`
- `integrity_status = 'clean'` (never `review`/`invalidated`)
- `ranked_date = <canonical UTC date>` and not a future date

Never included: anonymous/practice attempts, active/incomplete attempts,
invalidated attempts, test fixtures, client-submitted scores, or future dates.
The ranked schema's `ranked_requires_fields` constraint guarantees every valid
row already carries a non-null `username_snapshot` and `country_code_snapshot`, so
there are no "missing snapshot" rows to represent — a row without them cannot be a
valid ranked result.

---

## 2. Ranking order (one deterministic total order)

Used identically for the global list, the country list, the player's own
position, pagination boundaries, and after any void recalculation:

1. **higher `final_score`**
2. **lower `total_solve_ms`** (active solve time)
3. **earlier `completed_at`**
4. **lower attempt id** — the stable, deterministic final tie-break, **never
   exposed to the client**

Displayed position is **unique** per player (`row_number()` over that total
order). Two players are never shown tied when a tie-break separated them. The
client cannot re-sort to change rank — order is computed server-side.

`total_solve_ms` is a stored column on `attempts` (sum of `submitted_at −
opened_at` over non-void submitted slots), maintained by a `before update`
trigger at completion and by `recalculate_ranked_result`. Storing it lets the
ranking order be indexed; the Edge Functions are unchanged.

---

## 3. Percentile

Defined **once**, in `get_my_daily_rank`, so Results and the Leaderboard never
disagree:

```
percentile = ceil(100 × position / total), clamped to 1..100   ("you are in the top P%")
```

Returned as `global_percentile` / `country_percentile`. **Null** when the player
is the only ranked player in scope (`total = 1`) — the UI then shows the
"first ranked player" message instead of a percentile. The client's `topPercent()`
helper prefers the server value and falls back to the identical formula.

Examples: position 1 of 2418 → top 1%; position 382 of 2418 → top 16%; last place
→ top 100%.

---

## 4. Snapshot behavior

Historical rows use the **ranked attempt snapshots**, never live profile values:

- **Username** — `attempts.username_snapshot` (as it was at ranked start).
- **Country** — `attempts.country_code_snapshot`.

A later profile change (username or country) does **not** rewrite a completed
day. Country scope for "my country" is derived server-side from the caller's
snapshot for that date (falling back to their profile country only when they have
no result yet) — the client can never inject a country. A future forced
moderation/rename would need a documented exception path; this phase does not
build a moderation platform.

---

## 5. API contracts (RPCs)

Two read-only `SECURITY DEFINER` functions, `search_path` pinned to
`public, pg_temp`, **granted to `authenticated` only**. They read the
RLS-protected `attempts` table as the definer and gate anonymous callers
internally. The client always omits the date (server derives UTC today) and never
sends a country.

### `get_my_daily_rank(p_date default utc-today) → jsonb`
The personal summary (also the "summary" surface — Results, Home, and the
Leaderboard header all read it). Locked for anonymous-Auth users.

```
{ locked, has_result, ranked_date, score, score_locked, total_solve_ms,
  result_version, updated_after_validation, country_code,
  global_position, global_total, global_percentile,
  country_position, country_total, country_percentile }
```

### `get_daily_leaderboard(p_scope, p_date default utc-today, p_after_position default 0, p_limit default 50) → jsonb`
One page of sanitized rows for `'global'` or `'country'`.

```
{ locked, scope, ranked_date, total, page_size, after_position,
  next_after, has_more, country_code,
  rows: [ { position, username, country_code, score, solve_ms, is_current_user } ] }
```

**Public row fields:** `position`, `username` (snapshot), `country_code`
(snapshot), `score` (BrewScore), `solve_ms` (display-formatted client-side as
`3m 42s`), `is_current_user`. **Never exposed:** `user_id`, attempt id, email,
Auth/provider metadata, answers, integrity state/reasons, app version, scoring
internals, moderation data. Every response is validated client-side with a
**recursive** forbidden-field guard before it reaches a screen.

---

## 6. Pagination

Position-windowed over the deterministic total order (`row_number()`), paged by a
**server-clamped integer cursor** (`after_position`, the last position seen) —
never a client-trusted rank, and never the attempt id.

- Page size default **50**, hard cap **100** (clamped server-side).
- A negative cursor clamps to 0; a cursor past the end returns no rows, no error.
- Scope/date are parameters the server validates; a future date yields no rows.
- For a fixed result set the order is a **total** order (unique attempt-id
  tie-break), so pages have **no duplicates and no omissions**.
- A void recalculation changes `recalc_version` and can shift positions; the
  client refetches (below), which re-derives positions consistently.

**Why position-windowing, not keyset:** true keyset would encode the ordering
tuple — which includes the attempt id — into a client cursor, violating the "never
expose the tie-break id" rule. At the current (small) daily volume, position
windowing over the composite index is correct and simple. **Migration threshold:**
revisit to an opaque server-signed keyset cursor when a single day's ranked count
makes full-set `row_number()` per page too costly (order of ~10⁵ rows/day) — the
client contract (`after_position` + `next_after`) can stay the same, so the
migration is server-only.

---

## 7. Security & privacy boundary

- **Authenticated-only.** `anon` (the publishable/unauthenticated role) cannot
  call either function (grants revoked). Anonymous-**Auth** users get a `locked`
  response (no rows, no position), never ranked data.
- **No direct table/projection access.** `attempts` has no `authenticated` grant;
  `ranked_result_projection` remains service-role only. The RPCs are the only
  path to ranked data.
- **Current user derived from `auth.uid()`**; **country scope derived from the
  snapshot/profile** server-side. No arbitrary country/user injection, no lookup
  by raw UUID, no user-enumeration endpoint. `get_daily_leaderboard` has **no
  country parameter**.
- **No user-existence oracle** — a caller with no result gets a uniform
  `has_result: false`, not a distinguishable error.
- Page size capped server-side to bound abusive pagination.

Security Advisor: **0 blocking findings.** The one WARN
(`authenticated_security_definer_function_executable`) is expected and reviewed:
these functions must be `SECURITY DEFINER` to read the RLS-protected `attempts`
table, are granted only to `authenticated`, and gate anonymous callers internally.

---

## 8. Indexes & query plans

Two composite **partial** indexes, matching the exact filter + order (not
speculative per-column indexing):

```
attempts_leaderboard_global_idx  (ranked_date, final_score desc, total_solve_ms asc, completed_at asc, id asc)
attempts_leaderboard_country_idx (ranked_date, country_code_snapshot, final_score desc, total_solve_ms asc, completed_at asc, id asc)
  … both WHERE is_ranked and status='completed' and integrity_status='clean'
```

`EXPLAIN` (600-row fixture, `scripts/db/leaderboard-test.mjs`): at that volume the
planner correctly picks a ~2 ms seq/bitmap-scan + sort. With plain scans disabled,
the country query runs as an **ordered `Index Scan using
attempts_leaderboard_country_idx` with no Sort node** — proving the index is
aligned to serve both the filter and the ranking order; it becomes the natural
plan as daily volume grows. The previously-accepted `country_code_snapshot` FK
INFO advisory is now covered by the country index. Follow Supabase's index/perf
advisors rather than adding speculative indexes.

---

## 9. Void / recalculation behavior

When a Level-3 void triggers `recalculate_ranked_result`, it re-derives
`final_score`, `active_denominator`, **and `total_solve_ms`** over the surviving
(non-void) slots and bumps `recalc_version` (idempotent — only writes on change).
Leaderboard queries read the corrected values immediately, so positions update
deterministically with no duplicate rows. `get_my_daily_rank` reports
`updated_after_validation = true` (i.e. `recalc_version > 0`), and the client
invalidates its cached summary on ranked completion so a stale score is never
shown as current. Original per-slot results remain private for audit; frozen
share-card artifacts are not touched (none exist yet).

---

## 10. Refresh model

Query valid ranked results directly through the indexed RPCs. No Realtime, no
materialized view, no background cache (the contract is designed so those can be
added later **without changing the client**). The client refreshes:

- on opening the Leaderboard screen (and lazily per tab),
- on pull-to-refresh,
- after completing a ranked attempt (summary cache invalidated),
- naturally on the next open when returning to foreground.

No continuous refresh, no live animated rank movement. The personal summary is
cached in memory for the session (paints instantly, refreshes in the background).

---

## 11. UI states

- **Home** — after today's ranked brew is complete, a compact comparison (global
  #, top %, country #, totals, **View Leaderboards**) loads **after** the core
  Home/pack/ranked-status path (Phase 6B's fast first paint is preserved); it is
  never on the critical Home load.
- **Results** — the BrewScore reveals immediately; the rank comparison loads
  independently with a skeleton in the comparison area only. On failure the score
  stays visible with a calm **Retry** for the comparison (never implying the score
  failed to save). Practice/guest Results show **no** ranked position.
- **Leaderboard screen** — Global / Country tabs, today's UTC context + ranked
  player count, the current-user summary, top rows (`FlatList`, load-more,
  pull-to-refresh), current-user row highlighted, and a pinned **"Your position"**
  card when the user is outside the loaded page. Loading (skeleton), empty
  (encouraging/honest copy — "You're the first ranked player today.", "Complete
  Today's Ranked Brew to join the leaderboard.", "No ranked players from your
  country yet."), error/retry, and locked (anonymous) states. 48 dp controls,
  390 px and 320 px layouts, no fake/seeded rows.

Navigation reuses the existing overlay-state model (Home → Leaderboard, Results →
Leaderboard, Leaderboard → Back) — no navigation library added. Local mode has no
leaderboard (offline, unranked).

---

## 12. Tests

- `npm run db:leaderboard-test` — ranking order, ties (time/completed/id),
  positions/totals/percentile, pagination (dup/gap/clamp/cursor), exclusions
  (practice/incomplete/invalidated/anonymous/future), privacy (no private fields),
  security (grants/roles/direct-access), void reorder, mutation sentinels, and an
  `EXPLAIN` at 600-row volume.
- `npm run cloud:leaderboard-check` — the same guarantees against the **deployed**
  RPCs with isolated fixtures on a dedicated past date (created + cleaned up).
- `npm run test:cloud` — the client contracts (rank/page validators, recursive
  private-field rejection, `formatSolveTime`, `topPercent`).
