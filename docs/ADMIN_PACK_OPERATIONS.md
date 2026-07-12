# Admin Pack Operations (Phase 7H.2 design · Phase 7I backend live)

Safe future-pack authoring, scheduling, publication, and the incident-void workflow.

> **Phase 7I — the pack draft → publish BACKEND is built, tested and deployed**
> (`supabase/migrations/20260727090000_authoring_pack_drafts.sql`,
> `npm run db:pack-drafts-test` = 42 checks). The **pack editor / review / publish UI**
> is the next checkpoint; the design below is now the contract it drives.

## Pack draft backend (7I — live)

Private staging model (RLS, service-role only): `authoring_pack_drafts`
(intended_date, status, author/reviewer, `draft_version`, `pack_hash`,
constraint/difficulty/rotation/repetition summaries, `published_pack_id`,
`idempotency_key`) + `authoring_pack_draft_slots` (five position-welded category
slots, unique puzzle per draft). **No canonical `daily_packs` row exists until
publication.**

RPCs (all service-role, `SECURITY DEFINER`, pinned search_path, audited):
- `admin_create_pack_draft` — blank draft + five empty category slots.
- `admin_set_pack_slot` — category-locked, approved-only, not-already-scheduled,
  no in-draft duplicate; a change bumps `draft_version` and resets review/validation.
- `admin_validate_pack_draft` / `pack_draft_report` — blockers (≠5 slots, wrong
  category, unapproved/retired, already-scheduled, non-future/taken date) vs soft
  warnings (wide difficulty spread, engine repetition) + summaries + `pack_hash`.
- `admin_submit_pack_review` — requires a passing report → `awaiting_review`.
- `admin_decide_pack_review` — approve/reject/request_changes with **two-person
  control** (author can't approve own; Founder emergency needs a reason + audit
  marker `emergency:<uid>`); approve re-runs the report.
- `admin_publish_pack` — **atomic + idempotent**: future + unique UTC date, version
  check, final slot recheck, then create `daily_packs` (draft) → insert five
  `daily_pack_slots` (agreement trigger) → promote to `approved` (completeness
  trigger) → canonical `publish_pack()` makes it **live + immutable** on the date.
  A repeat call with the same idempotency key returns the same pack.
- `admin_cancel_pack_draft` — cancels an unpublished draft (published ones are
  immutable). `admin_pack_queue` / `admin_pack_eligible_puzzles` — paginated reads,
  no answers, eligible pool excludes published + wrong-category + unapproved.

**Reuses, never reinvents:** `enforce_slot_puzzle_agreement`,
`enforce_pack_completeness`, `enforce_published_pack_immutable`,
`daily_pack_slots.puzzle_scheduled_once` (global no-reuse), and `publish_pack`.

**Future correction policy (Task 25 decision):** once published a pack is canonical
`live` and immutable by `enforce_published_pack_immutable`; correction happens on the
DRAFT before publication (edit → revalidate → reapprove → republish), or, after
publication, via **cancel-the-draft + publish a replacement to a different date** —
never a silent overwrite. Altering a *consumed* pack's denominator is exclusively the
incident-void path.

## Draft pack model (planned)
A dedicated draft-pack representation (not overloading live `daily_packs`): unique
draft id, nullable intended UTC date, exactly five ordered slots in the fixed
category order, approved/reserve puzzle refs, difficulty/rotation/repetition summary,
constraint status, pack hash, author, review/approval state.

## Constraints (hard — never relaxed)
Exactly five slots · fixed category order (Observation→Pattern→Logic→Language
Logic→Attention Speed) · one puzzle per slot · unique puzzle ids · correct category ·
validator passed · approved/reserve · engine active/supported · not retired. The DB
already enforces slot↔puzzle agreement (`enforce_slot_puzzle_agreement`: slots hold
only approved, category/engine-matching puzzles) and pack completeness
(`enforce_pack_completeness`: approved/live/archived packs need five valid slots in
order). Scheduler assistance reuses the deterministic scheduler and must report
infeasibility honestly with an explicit relaxation order that never touches
correctness/validation/category/engine/five-slot completeness.

## Publication (planned, atomic + idempotent)
Publishing produces canonical `daily_packs` + `daily_pack_slots` for a unique UTC
date, refuses retired/incomplete content, reconfirms every puzzle state
transactionally, requires recent authentication + confirmation, preserves the pack
hash, and audits. Future packs are modifiable only while future/non-live/unused;
**live/used packs are immutable** — no unpublish, no replacement, no hot-swap.

## Incident void (existing Level-3 policy)
The safe void-a-live-slot workflow (Founder-only, reauth, typed confirmation,
affected-count display, idempotent recalculation, cache invalidation, audit) exposes
the EXISTING void/recalculation policy — it never becomes a casual "delete live
puzzle". Frozen share images are not mutated. (Admin UI wiring: next milestone; the
underlying void/recalc functions already exist — see RANKED_DAILY_ATTEMPTS.md.)
