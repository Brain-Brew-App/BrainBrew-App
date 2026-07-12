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

## 3a. Registry-driven forms + safe previews (Phase 7H.3.2A — Observation + Pattern)

The authoring UI is **registry-driven**: each engine contributes a pure
`EngineFormSchema` (`apps/admin/lib/authoring/engines/`) — `fieldGroups`,
`defaultForm`, `serializeFormToSeed`/`deserializeSeedToForm`, `clientValidate`,
`previewAdapter`, help/accessibility/small-screen notes, and approved input sources.
A single generic form (`AuthoringForm.tsx`) renders any engine from its field
groups via shared primitives (`FormPrimitives.tsx`); a single generic preview
(`Preview.tsx`) renders a sanitized `PreviewModel` at 320dp and 390dp. There is **no
per-engine form component and no giant switch** — the remaining nine engines are
added as data.

**All 15 active engines** are authorable through this one workflow (7H.3.2A shipped
Observation + Pattern; 7H.3.2B completed Logic, Language Logic, Attention Speed):
OBS_001/003/004, PAT_001/002/003, LOG_001/002/003, LNG_001/002/003, ATT_001/002/003.

- **Curated-scenario engines** (Deduction, Ordering, Analogy, Odd Word Out, Sentence
  Ordering) are index selectors into the canonical tables, surfaced as **answer-free**
  `{value,label}` options via `AUTHORING_VOCAB.scenarioOptions` — the full tables (with
  answers) stay in the server bundle. Odd Word Out / Ordering / Sentence Ordering can't
  author a wrong answer: correctness is guaranteed by the curated scenario + derivation.
- **Balance Scales** assembles a canonical `weights/scales/query` seed from an approved
  weighting template (A/B/C/D) + integer parameters; the balancing and unique-ratio
  proof stay in the canonical builder/validator.
- **Attention Speed** engines share timed-task controls (duration/grid/count) and render
  **static storyboards** (Symbol Sweep grid, Memory Flash ready→exposure→interval→
  selection, Rapid Classification stream + buckets) — no real timed/ranked attempt, no
  token, no analytics.
- **Sentence Ordering** shows a persistent "Human review is mandatory" warning — the
  deterministic validator cannot rule out all linguistic arguability.

Proven by `npm run test:authoring-forms` (**323 checks**): registry + cross-engine
completeness (all 15, unique ids, category grouping, versions, notes, no score-formula
field), every default builds+validates clean, form↔seed round-trips, client rejects,
the canonical validator catches each engine's invalid mutation, and previews reveal no
answer without an authorized overlay.

**Submit for review (7H.3.2B).** A generic action exposes the tested 7H.2
`admin_submit_draft_review` backend: it requires a passing validation (status `built`),
a matching content hash (guards a stale/unsaved edit), required author notes, and audits
the transition to `awaiting_review`. The reviewer workbench remains the next
content-operations checkpoint.

**Security boundary.** All schema functions and the canonical bundle stay
server-side. The client sends raw form values to `authorFromFormAction`, which
serializes → builds/validates canonically → returns a sanitized `PreviewModel`. The
answer overlay is included **only** for a `review_content` role with recent auth and
an explicit request. Verified: no `buildCandidate`/`validatePuzzle`/`serializeFormToSeed`/
answer code appears in any client chunk; the form route ships ~4 kB of client JS.

**Approved inputs only.** Glyph pickers draw from the canonical `AUTHORING_VOCAB`
(re-exported through the boundary — no drift, no free Unicode). Sequence families,
matrix rules and repair-family restrictions come from the same source.

**Proven by `npm run test:authoring-forms` (89 checks):** every engine's default
form builds + validates clean; form↔seed round-trips are stable; unknown/missing/
out-of-range fields are rejected; the canonical validator catches every specified
invalid mutation (two-odd-tiles, cell-count leak, symmetric/disconnected target,
same-row/column/adjacent pair, distractor collisions, constant attribute, two valid
options, multi-attribute distractor, no-repair, term-count, chip width…); preview
adapters accept valid payloads, reject malformed ones, and reveal no correct/
highlight without an answer.

## 4. Implemented vs the authoring-UI milestone

**Implemented + deployed now:** the draft model, the full review/approval state
machine with validation-gating + two-person control, promote-to-reserve, the
canonical-reuse proof, and (from 7H.1) retire + delete-unused-draft.

**Deferred to the authoring-UI milestone:** the 15 engine-specific seed forms, the
in-Next build/validate wiring across the deployment boundary (§1), safe per-engine
previews, in-place draft editing UI, the revision/versioning UI, and the review-queue
screens. The backend they call is in place and tested.
