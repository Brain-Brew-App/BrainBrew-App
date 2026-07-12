# Admin Content Operations (Phase 7H)

Read-only content pages backed by real RPCs (service-role, paginated, exclusion-
aware). No approve/publish/void actions here — content still flows through the
deterministic validators + the certified server pipeline.

---

## Pages

- **Puzzles** (`/puzzles`) — filter by category / status / reserve-vs-scheduled;
  paginated (25/page, cap 100). Columns: id, category, engine, difficulty, status,
  reserve, validation, ranked/practice appearances, content-hash. RPC `admin_puzzles`.
- **Puzzle detail** (`/puzzles/[id]`) — safe representation (prompt, public payload,
  validation history, scheduled usage, ranked score/solve/correct distributions).
  RPC `admin_puzzle_detail`. **Answer key** is a separate RPC (`admin_puzzle_answer`)
  revealed ONLY to Founder / Content Admin (capability `manage_content`), and the
  reveal is **audited** (`view_answer_key`). Hidden from all other roles.
- **Daily Packs** (`/packs`) — packs from −45d to +14d (includes future scheduled);
  status, difficulty, incident, participants, completions, avg score, hash; today
  highlighted; a banner warns when no live pack exists for today. RPC `admin_packs`.
- **Content Review** (`/content`) — lifecycle queue by status with per-status counts
  and latest validation findings; paginated. RPC `admin_content_queue`. Confidence /
  similarity components are shown where the pipeline stores them and labeled
  unavailable otherwise (never fabricated). No approval bypass.
- **Categories & Engines** (`/engines`) — registry config (active, difficulty range,
  rotation weight, weekly cap, spacing, approved/reserve counts) joined with 30-day
  ranked exposure + informational flags. RPCs `admin_engine_registry` + `admin_engine_stats`.

## Privacy / safety

- Answer payloads only via `admin_puzzle_answer`, role-gated + audited.
- All RPCs are service-role only; client roles are denied (tested in `db:admin-test`).
- Reads only — engine editing, puzzle approval, and pack publish/void remain
  deferred to a certified workflow with two-person approval + audit.

## Pending (needs mobile events / larger data)
Platform split, Practice-vs-ranked and first-vs-repeat engine breakdowns, pack
score-distribution/leaderboard/share detail — surfaced as pending until instrumented.
