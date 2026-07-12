# Admin Puzzle Authoring (Phase 7H.2)

The safe authoring architecture: engine-schema-driven seed input → canonical build
→ independent validation → review → promote-to-reserve. Unapproved candidates never
touch canonical content.

---

## 1. Canonical reuse (no duplication)

The Admin authoring path reuses the SAME modules as the content pipeline:
- **Builders:** `src/content/authoring.ts` (15 typed `seed → puzzle` builders).
- **Independent validator:** `src/content/validators.ts` `validatePuzzle(p)` — the
  single dispatch entry point.
- Engine registry, glyph families, lexicon, content hashing — all canonical.

Proven by `npm run test:canonical-authoring`: all **326** canonically-built puzzles
pass `validatePuzzle` with zero findings, all 15 engines represented, and a
deliberately-broken candidate is caught. The Admin build→validate step calls exactly
these functions server-side; validation logic is **never** re-implemented in the UI.

> **Deployment boundary (RESOLVED — Phase 7H.3.1).** The `brainbrew-admin` Vercel
> project is rooted at `apps/admin` and cannot import `../../src/content/*` at build
> time. The build/validate step now runs through a **generated single-source bundle**:
> esbuild compiles the pure entry `src/content/authoringBoundary.ts` (which re-exports
> the canonical builders + validator + registry + split + `canonicalStringify`) into
> `apps/admin/lib/authoring/canonical.generated.mjs`, imported by a `server-only`
> wrapper. It is a mechanical build artifact of ONE source (no duplication), guarded
> by a staleness check and proven **byte-identical to the content pipeline for all
> 326 puzzles** (`npm run test:authoring-boundary`). Full decision + rejected options:
> [ADMIN_AUTHORING_ARCHITECTURE.md](ADMIN_AUTHORING_ARCHITECTURE.md).

## 2. Draft model (implemented + tested)

`authoring_drafts` (migration `20260726090000_authoring_drafts.sql`) — a DEDICATED
private table (RLS, service-role only) so drafts never pollute `puzzles`/
`puzzle_seeds`. Holds: engine/category/difficulty, seed, built payload, private
answer, explanation, content hash, validation `{passed, findings}`, `parent_puzzle_id`
(revisions), `draft_version`, author/reviewer, notes, status.

## 3. Review state machine (implemented + tested — `npm run db:authoring-test`, 23)

`draft → built | validation_failed → awaiting_review → approved | rejected |
changes_requested → promoted`. Server-controlled RPCs (no arbitrary status dropdown):
- `admin_save_draft` — persists a built+validated candidate; **a rebuild resets an
  in-review draft** back to built and clears the reviewer (version bumped).
- `admin_submit_draft_review` — requires a **passing validation**.
- `admin_decide_draft_review` — approve/reject/request_changes. **Approval requires
  a passing validation** (a failed validator can NEVER be approved) and enforces
  **two-person control** (the author cannot approve their own candidate; a Founder
  emergency override requires an explicit reason and is audited). Audited in-txn.
- `admin_promote_draft_to_reserve` — atomically creates the canonical `puzzles` +
  `puzzle_answers` + passing `puzzle_validation_results` (satisfying the existing
  approval trigger), yielding an **approved, unscheduled (reserve)** puzzle. The
  draft is marked `promoted`. Audited.

All service-role only; client roles denied (tested). Answer payloads are never
returned to unauthorized roles.

## 4. Implemented vs the authoring-UI milestone

**Implemented + deployed now:** the draft model, the full review/approval state
machine with validation-gating + two-person control, promote-to-reserve, the
canonical-reuse proof, and (from 7H.1) retire + delete-unused-draft.

**Deferred to the authoring-UI milestone:** the 15 engine-specific seed forms, the
in-Next build/validate wiring across the deployment boundary (§1), safe per-engine
previews, in-place draft editing UI, the revision/versioning UI, and the review-queue
screens. The backend they call is in place and tested.
