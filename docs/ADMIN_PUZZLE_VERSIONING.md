# Admin Puzzle Versioning (Phase 7H.2)

Immutable content is never edited in place — a new **revision** is created.

## Rules
- **Editable in place:** ONLY a draft that is unapproved, never scheduled, never
  served in Practice/ranked, and not referenced by an immutable record. Any seed
  edit invalidates the built candidate + validation, requires rebuild, resets review
  state, bumps `draft_version`, and is audited (enforced by `admin_save_draft`).
- **Immutable (approved/scheduled/served/historical):** never edited in place.
  Create a new draft **revision** with `parent_puzzle_id` set to the source puzzle;
  the seed is copied as an editable starting point; rebuild + revalidate + fresh
  review are required; the old puzzle row, answer, and content hash are preserved;
  no pack use is auto-replaced. On promote, the revision becomes a new reserve
  puzzle with a new stable id — the lineage (`parent_puzzle_id`) is retained.
- Version lineage is stored on `authoring_drafts.parent_puzzle_id` and surfaces on
  the puzzle detail page (UI: authoring-UI milestone).

## Diffs
Structured before/after (seed, prompt, payload, options, answer representation,
explanation, difficulty, builder/validator versions, content hash). Answer diffs are
role-gated (Founder/Content). (Diff UI: authoring-UI milestone; the data model
supports it now.)

## Guarantees
Live/historical puzzle rows, answers, and content hashes are never mutated — history
stays reconstructable (attempts snapshot content). See ADMIN_CONTENT_LIFECYCLE.md.
