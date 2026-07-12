# Admin Content Lifecycle & Historical Integrity (Phase 7H.1)

The formal content states, allowed transitions, and the mandatory historical-
integrity rules that govern every content mutation.

## States
`draft → validated → approved → reserve/scheduled → live → retired` (or
incident-voided). `puzzle_status` enum: draft / validated / approved / retired.
Approval is gated by a DB trigger (`enforce_puzzle_approval`): a puzzle can be
approved ONLY with a passing validation result **and** a stored answer. Slots
(`enforce_slot_puzzle_agreement`) only ever hold an **approved** puzzle with a
matching category/engine — so drafts can never be scheduled.

## Historical-integrity classes (mandatory)
- **A — never used:** editable/deletable under strict conditions.
- **B — approved/reserve, never scheduled:** versionable or retirable; hard-delete
  only if no references and policy permits.
- **C — scheduled in a future non-live pack:** content/answer immutable; unschedule/
  replace only via a validated pack operation; edits create a new version.
- **D — live or historically used:** **immutable forever** — never hard-deleted,
  never answer/prompt-changed; may be retired from future use or incident-voided;
  history stays reconstructable.

## Implemented mutations (this phase)
- **Retire** (`admin_retire_puzzle`) — sets `status=retired`; **blocked** if a
  future/undated non-archived pack references it (correct the pack first). Excludes
  the puzzle from future Practice/pack selection; **all history stays valid**
  (attempts snapshot content). Content roles (`manage_content`); audited in-txn.
- **Hard-delete unused draft** (`admin_delete_unused_draft`) — allowed ONLY for a
  `draft`, never-approved, never-scheduled, never-practice-used puzzle. Transactional
  reference checks + a row lock (`for update`) prevent races; audited before the
  cascade. Requires **reauthentication** (password) + typed `DELETE` confirmation in
  the UI. Used/approved/scheduled/historical content can NEVER be hard-deleted.

Both are service-role only; client roles are denied (tested in
`db:content-mutations-test`, 13 checks).

## Deferred to the next content-ops milestone
Full authoring (create/build/validate via the canonical builder+validator),
in-place draft editing, **versioning** of immutable content (new stable id +
supersedes link, rebuild+revalidate+review), the review/approval workflow, and
pack create/schedule/publish/void operations. The immutability guards above are the
safe foundation these build on. No validator bypass, no live-membership edit, no
hot-swap — ever.

## Phase 7H.2 — authoring drafts + review state machine

Draft authoring now has a dedicated private `authoring_drafts` table + a
server-controlled review state machine (`draft → built | validation_failed →
awaiting_review → approved | rejected | changes_requested → promoted`) with
validation-gated approval, **two-person control**, and `promote_to_reserve` that
creates canonical approved (reserve) content atomically. Canonical builders +
`validatePuzzle` are reused (proven: 326 valid, broken caught). See
ADMIN_PUZZLE_AUTHORING.md / ADMIN_PUZZLE_VERSIONING.md / ADMIN_CONTENT_SECURITY.md.
Tested: `db:authoring-test` (23), `test:canonical-authoring` (4).
