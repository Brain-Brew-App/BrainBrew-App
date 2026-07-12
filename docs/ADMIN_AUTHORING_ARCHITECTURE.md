# Admin Authoring Architecture — Canonical Execution Boundary (Phase 7H.3.1)

How the isolated Admin app builds and validates puzzle candidates using the **one**
canonical builder + validator, without duplicating them and without shipping any
answer or secret to the browser.

---

## The problem

- The canonical content pipeline lives in `src/content/*` (Node/RN TypeScript):
  15 builders (`authoring.ts`), one independent validator (`validators.ts`), the
  engine registry (`engines.ts`), the public/private split (`publicFields.ts`), and
  deterministic hashing (`scripts/db/canonical.mjs`). This is the single source of
  truth that produces the **326 puzzles / 50 packs** with fixed content hashes.
- The Admin is a **separate Vercel project** (`brainbrew-admin`) rooted at
  `apps/admin`. Vercel only uploads the root directory at build, so the Admin
  **cannot** `import '../../src/content/*'` — those files are not present in its build.
- The canonical modules use **extensionless imports** (`from '../types/puzzle'`),
  which Deno rejects — so they also cannot be imported raw by a Deno Edge Function.

We must give the Admin the canonical build+validate with: exactly one builder
implementation, exactly one validator implementation, no re-implementation, no
service-role secret in the browser, an isolated Vercel build, Node/Deno
compatibility, and **byte-identical** hashes to the existing 326 puzzles / 50 packs.

## Decision — Option A: a generated single-source bundle imported server-only

We esbuild the pure entry `src/content/authoringBoundary.ts` — which re-exports the
existing builders, validator, registry, split and a `canonicalStringify` — into
**one self-contained ESM module** committed at
`apps/admin/lib/authoring/canonical.generated.mjs`. The Admin imports it from a
**server-only** wrapper (`apps/admin/lib/authoring/canonical.ts`) that hashes with
`node:crypto` exactly as the importer does.

- **One implementation.** The bundle is a *mechanical build artifact* of one source
  (`authoringBoundary.ts` → the existing `src/content` modules) — like a compiled
  output, not a second hand-maintained copy. `authoringBoundary.ts` re-exports the
  canonical functions; it re-implements only the ~5-line `canonicalStringify` and the
  pure `splitBuilt`, both **byte-parity-tested** against the pipeline.
- **No duplication that can drift.** `npm run authoring:bundle:check` regenerates and
  diffs the committed bundle (wired into the gate) — a stale or hand-edited bundle
  fails CI. `npm run test:authoring-boundary` proves the bundle equals the content
  pipeline for **all 326 puzzles** on three axes (hash, split, validator).
- **Isolated build preserved.** The bundle lives *inside* `apps/admin`, so Vercel's
  root-directory upload is untouched; no monorepo/workspace rewiring of the Expo
  project's dependency tree.
- **No secret, no answer in the browser.** `import 'server-only'` keeps the builders,
  validator and any answer out of every client bundle (verified: the `/content`
  route ships 165 B and no client chunk contains `buildCandidate`/`oddTileId`/
  `canonicalStringify`). Build/validate are **pure** and need no DB and no
  service-role key — the key is only used later to persist a reviewed draft via the
  existing `admin_save_draft` RPC.
- **Node + Deno compatible.** The bundle is `platform: 'neutral'` pure ESM (no
  `node:` built-ins inside it); it runs under the Next.js Node server today and could
  run under Deno unchanged. The Node parity test executes the exact bundle.
- **Byte-identical hashes.** `sha256(bundle.canonicalStringify(p))` equals
  `contentHash(p)` from `scripts/db/canonical.mjs` for every one of the 326 puzzles;
  `splitBuilt` equals the importer's `splitPuzzle` for every puzzle. The 326 puzzle
  and 50 pack hashes are therefore unchanged.

## Rejected alternatives

**Option B — Supabase authoring Edge Function.** Keep canonical modules in `src/`,
expose a private Deno function the Admin calls at runtime to build+validate.
Rejected because:
- It does **not** avoid bundling — the canonical modules' extensionless imports are
  Deno-incompatible, so the code would still have to be bundled for Deno. It adds the
  bundling problem *plus* a network hop and a separate deploy/version surface.
- Build+validate are **pure** — they need no database and no service-role secret, so
  there is no security reason to move them server-of-server. A `server-only` module
  in the Next.js server is already private.
- It is harder to prove correct: verifying it needs a live deploy + authed call,
  whereas the generated bundle is provably byte-identical in a plain Node test.
- Higher latency for an interactive authoring form.

We keep an Edge Function on the table **only** for operations that genuinely need the
database transactionally (draft persistence, promotion, publication, void) — those
already run as `SECURITY DEFINER` RPCs, which is the right server boundary. Pure
build/validate does not need it.

**npm workspaces / shared published package.** Convert the repo to workspaces so
`apps/admin` can import a shared `@brainbrew/content` package. Rejected: it entangles
the Expo app's dependency graph with the Admin's and risks the deliberately-isolated
Vercel build for the Admin, for no benefit the generated bundle doesn't already give.
The generated bundle *is* the "shared package," minus the install-graph coupling.

## Contract + version pinning (Tasks 2–3)

`apps/admin/lib/authoring/contract.ts` defines the typed `BuildRequest` /
`BuildResponse` and the pinned versions:

- `AUTHORING_SCHEMA_VERSION`, `BUILDER_VERSION`, `VALIDATOR_VERSION` are recorded on
  every build. A request that pins a different builder/schema is rejected
  (`unsupported_schema_version`) rather than silently reinterpreted.
- The response carries `contentHash`, `seedHash`, `builtAt`, `validation.validatedAt`,
  `validatorVersion`, blocking/warning/similarity findings, `hasAnswer`, and a
  sanitized `preview`. When a candidate is rebuilt under a newer builder/validator,
  the DB state machine bumps `draft_version`, clears the stale build/validation, and
  forces re-review (already enforced by `admin_save_draft`; the UI shows the diff).

## Failure behavior (Task 4)

`buildAndValidateCandidate()` never partially inserts canonical content and never
throws for bad input. It maps to typed failures: `unsupported_engine`,
`unsupported_schema_version`, `invalid_seed`, `build_error` (a builder that throws on
an impossible seed), `timeout` (a hard build budget), and `permission_denied`
(enforced at the action layer). Persistence is a **separate** reviewed step
(`admin_save_draft` / `admin_promote_draft_to_reserve`), so a failed build leaves no
draft/validation drift.

## The answer is gated

`buildCandidateAction` (`app/(dash)/content/authoring/actions.ts`) resolves
`authorizedForAnswer` from the caller's Admin role (`review_content`) **and**
server-verified recent auth — never from client input. When not authorized, the
response omits the answer entirely and only reports `hasAnswer`.

## Files

| File | Role |
|---|---|
| `src/content/authoringBoundary.ts` | The single pure entry: re-exports canonical builders/validator/registry/split + `canonicalStringify` + `buildCandidate`. |
| `scripts/build-authoring-bundle.mjs` | esbuild generator (`--check` for the staleness gate). |
| `apps/admin/lib/authoring/canonical.generated.mjs` | Generated bundle (DO NOT EDIT). |
| `apps/admin/lib/authoring/canonical.generated.d.mts` | Types for the bundle. |
| `apps/admin/lib/authoring/contract.ts` | `BuildRequest`/`BuildResponse` + version constants. |
| `apps/admin/lib/authoring/canonical.ts` | `server-only` wrapper: hashing, version pinning, failure handling, answer gating. |
| `apps/admin/app/(dash)/content/authoring/actions.ts` | RBAC + recent-auth + audit gate around the boundary. |
| `scripts/authoring-boundary-test.mjs` | Byte-identity proof (326 puzzles: hash, split, validator) + failure handling. |

## Commands

```
npm run authoring:bundle          # regenerate the bundle from src/content
npm run authoring:bundle:check    # gate: fail if the committed bundle is stale
npm run test:authoring-boundary   # prove the bundle == the content pipeline (326)
```

## What this unblocks (next checkpoints)

7H.3.2 (15 engine schemas/forms/previews) binds registry-driven forms to
`buildCandidateAction`; 7H.3.3 persists via the existing draft RPCs; previews render
the `preview.publicPayload`. None of them re-implement build or validate — they all
go through this one boundary.
