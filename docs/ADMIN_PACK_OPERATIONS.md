# Admin Pack Operations (Phase 7H.2)

Design for safe future-pack authoring, scheduling, publication, and the incident-void
workflow. **Read pages are live (7H); the mutation operations below are the next
milestone** — the safety rules and the existing server guarantees they build on are
documented here so they are built correctly.

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
