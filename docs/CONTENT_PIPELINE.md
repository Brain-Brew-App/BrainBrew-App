# BrainBrew — Content Pipeline (Tier 2)

**Status:** Phase 2 output. The operational manual for content.
**Subordinate to:** [`CORE_SPEC.md`](CORE_SPEC.md) (the constitution) and [`ENGINE_CATALOG.md`](ENGINE_CATALOG.md) (the engines). Where they disagree with this document, they win.

This document defines how a puzzle comes into existence, how it is proven correct, how it reaches a player, and how it dies. It is written to be followed on a tired Sunday afternoon at candidate #140, which is exactly when a bad puzzle slips through a good pipeline.

> **AI generates content. Humans design engines.**
> Nothing in this phase uses AI. What it builds is the *rail* AI will later run on: a typed authoring surface, a curated ontology it may read but never extend, and a deterministic validator per engine that must pass before a human ever looks at a candidate.

---

## 1. The one thing to understand

An author never writes a puzzle. An author writes a **seed**.

```ts
// This is the whole of an author's job.
{ family: 'oblong', params: [2], correctIndex: 1, difficulty: 4 }
```

From that, `src/content/authoring.ts` derives the terms, the four options, the three typed distractors, the explanation, and the timing envelope. Then `src/content/validators.ts` — which shares no code with the builder — re-derives the answer *independently* and refuses the puzzle if the two disagree.

That independence is the safety property. If the builder and the validator shared a helper, a bug in the derivation would validate itself.

**The pipeline never trusts an assertion.** Not from a human, not from a model. It re-computes.

---

## 2. Puzzle lifecycle

```
   seed  ──▶  built  ──▶  validated  ──▶  reviewed  ──▶  approved
                              │               │              │
                              ▼               ▼              ▼
                          rejected        rejected      scheduled  ──▶  live  ──▶  archived
                                                                            │
                                                                            ▼
                                                                    voided / retired
```

| State | Meaning | Who moves it | Reversible? |
|---|---|---|---|
| **seed** | A typed object in `src/content/library.ts`. Not yet a puzzle. | Author | yes |
| **built** | A `Puzzle` derived by a builder. Exists only in memory. | Machine | n/a |
| **validated** | Passed every deterministic rule for its engine. | Machine | n/a |
| **rejected** | Failed ≥1 rule. Never shown to a reviewer. The failure names the rule. | Machine | fix the seed |
| **reviewed** | A human read it, played it, and judged the *taste* the validator cannot. | Reviewer | yes |
| **approved** | Eligible for scheduling. | Reviewer | yes, until scheduled |
| **scheduled** | Assigned to a pack index (later: a date). | Scheduler | yes, until live |
| **live** | Published. **Immutable.** (Core Spec §2) | — | **no** |
| **archived** | The day has passed. Still reconstructable for dispute (§9.5). | — | no |
| **voided** | A Level-3 incident. Removed from scoring, scores rescaled. | Founder | no |
| **retired** | Withdrawn from future scheduling. Never deleted. | Founder | yes |

**A live puzzle is never edited.** Not for a typo, not for a better explanation. Core Spec §10 is unambiguous: the published pack is immutable; incidents are handled by voiding and rescaling, never by substitution.

---

## 3. Author workflow

1. **Pick an engine that needs content.** `npm run audit` prints authored vs. scheduled counts per engine. Author into the shallowest pool.
2. **Write a seed** in `src/content/library.ts`. Never a `Puzzle` object; never raw JSON.
3. **Run `npm test`.** Every seed is built and validated. A bad seed fails here, loudly, naming the rule it broke.
4. **Run `npm run audit`.** Check the new content did not duplicate a concept, exhaust a distractor, or skew the difficulty curve.
5. **Play it.** In the app, via the dev pack switcher. A puzzle that validates can still be joyless.

**Batch, don't drip.** Core Spec §4: one weekend a month, not fifteen minutes a day. Author one engine at a time, not one pack at a time — context-switching between engines is a distinct and worse kind of fatigue than volume.

### What an author is *not* allowed to do

- Add a word to the ontology without checking every existing set still validates. (The leave-one-out check is global.)
- Add a glyph that has not been rendered on real iOS **and** Android hardware.
- Hand-write an option, a distractor, or an explanation. If a builder cannot produce it, the *builder* is wrong.
- Reuse an id. Ids are permanent: an archived attempt refers to one.

---

## 4. The curated ontologies

`src/content/lexicon.ts` holds everything the pipeline knows about the world:

| Ontology | Used by | Why it is human-owned |
|---|---|---|
| `GLYPH_FAMILIES` | Odd One Out | A glyph that renders wrong doesn't look wrong — it **destroys the puzzle**. |
| `PAIR_GLYPHS`, `SWEEP_GLYPHS` | Pair Find, Symbol Sweep | Same. |
| `CLASSIFICATION_RULES` | Rapid Classification | A rule must be *total* over its alphabet. "Is a diamond curved?" has no answer, so diamonds are excluded from the curved alphabet. |
| `DEDUCTION_SCENARIOS` | Deduction | The *logic* is computed from the form. Only the nouns are authored, and negations are written by hand — never machine-formed. |
| `ANALOGIES` | Analogy | Relations come from a closed catalogue. Distractors are *typed* (wrong-relation, part-of-answer, same-field). |
| `ODD_WORD_SETS` | Odd Word Out | Category membership is asserted **by a person**, and the validator proves uniqueness from it. |

> **The rule that protects everything else:** a model may one day *choose* an entry from these tables. It may never *add* one, and it may never assert a fact that lives in one.
>
> A model will tell you, fluently and without hesitation, that a tomato is a vegetable. The leave-one-out validator would believe it, and would then certify an ambiguous puzzle as having exactly one answer.

---

## 5. Content schema, per engine

**Legend.** *Req* = required to create the puzzle. *AI?* = a model could propose this once generation exists. *Val* = a deterministic validator checks it. *Rev* = needs human judgement.

### Common to every puzzle

| Field | Req | AI? | Val | Rev | Notes |
|---|:-:|:-:|:-:|:-:|---|
| `id` | ✔ | ✖ | ✔ | ✖ | Permanent. Assigned by the author, never reused. |
| `engineId` | ✔ | ✖ | ✔ | ✖ | Must match the category. |
| `category` | ✔ | ✖ | ✔ | ✖ | Derived from the engine. |
| `difficulty` | ✔ | ✔ | ✔ | ✔ | Authored intent, 1–5. Empirical difficulty (§7 of the Core Spec) will later correct it. |
| `prompt` | ✔ | ✖ | ✔ | ✔ | Generated by the builder. Never hedged. |
| `explanation` | ✔ | ✔ | ✔ | ✔ | Must name a rule, a quantity or a relation. ≥25 chars, ends in a full stop. |
| `timing` | ✔ | ✖ | ✔ | ✖ | Derived from difficulty. `par < limit`. |

### `OBS_001` Odd One Out

| Field | Req | AI? | Val | Rev | Rule |
|---|:-:|:-:|:-:|:-:|---|
| `family` | ✔ | ✔ | ✔ | ✔ | Must be a curated family. |
| `majority`, `odd` | ✔ | ✔ | ✔ | ✖ | Two distinct members of that family. |
| `tiles`, `columns` | ✔ | ✔ | ✔ | ✖ | Grid fills complete rows; ≥3 rows. |
| `oddIndex` | ✔ | ✔ | ✔ | ✖ | Never first or last. |

*Validates:* exactly two distinct glyphs; the odd glyph appears once; the difference is orientation or internal detail, never colour.

### `OBS_003` Rotation Match

| Field | Req | AI? | Val | Rev | Rule |
|---|:-:|:-:|:-:|:-:|---|
| `grid`, `cells` | ✔ | ✔ | ✔ | ✖ | Selects the enumerated shape pool. |
| `shape` | ✔ | ✔ | ✔ | ✖ | Index into that pool. Pool is chiral + rotationally asymmetric by construction. |
| `turns` | ✔ | ✔ | ✔ | ✖ | 1, 2 or 3 quarter-turns. |
| `correctIndex` | ✔ | ✔ | ✔ | ✖ | Walks, so the answer is never positionally learnable. |

*Validates:* target has four distinct rotations and is chiral; exactly one candidate is a rotation; **every candidate has the same filled-cell count** (else the puzzle is solved by counting); one candidate is the mirror; all connected.

### `OBS_004` Pair Find

| Field | Req | AI? | Val | Rev | Rule |
|---|:-:|:-:|:-:|:-:|---|
| `pair` | ✔ | ✔ | ✔ | ✖ | The repeated glyph. |
| `others` | ✔ | ✔ | ✔ | ✖ | All distinct, none equal to `pair`. |
| `at` | ✔ | ✔ | ✔ | ✖ | The two positions: different row, different column, non-adjacent. |

### `PAT_001` Sequence Completion

| Field | Req | AI? | Val | Rev | Rule |
|---|:-:|:-:|:-:|:-:|---|
| `family` | ✔ | ✔ | ✔ | ✖ | From the closed rule-family list. |
| `params` | ✔ | ✔ | ✔ | ✖ | The model emits a rule, never the numbers. |
| `length` | ✖ | ✔ | ✔ | ✖ | 4–5 terms; more wrap at 320dp. |

*Validates:* ≤3 digits per term; options positive, distinct, numeric; **no distractor already appears in the visible run** — that would be a free elimination.

### `PAT_002` Matrix Completion

| Field | Req | AI? | Val | Rev | Rule |
|---|:-:|:-:|:-:|:-:|---|
| `rules` | ✔ | ✔ | ✔ | ✖ | One of `rowConstant` / `colConstant` / `latin` per attribute. |
| `coeffs` | ✖ | ✔ | ✔ | ✖ | Latin-square coefficients. |
| `correctIndex` | ✔ | ✔ | ✔ | ✖ | |

*Validates:* the missing figure is **independently re-derived** from the eight visible cells; exactly one option satisfies every rule; each distractor breaks **exactly one** attribute; no attribute is constant across the grid (that is decoration, not a rule).

### `LOG_001` Deduction

| Field | Req | AI? | Val | Rev | Rule |
|---|:-:|:-:|:-:|:-:|---|
| `scenario` | ✔ | ✔ | ✔ | ✔ | Index into the curated scenario list. |
| `correctIndex` | ✔ | ✔ | ✔ | ✖ | |

*Validates:* ≥2 premises; ≤18 words per premise, ≤14 per option; distractors come from the fallacy catalogue; if the answer restates a premise (the trap form), the explanation must say why that is the point.
*Human reviews:* whether the nouns carry any cultural assumption.

### `LOG_002` Balance Scales

| Field | Req | AI? | Val | Rev | Rule |
|---|:-:|:-:|:-:|:-:|---|
| `weights` | ✔ | ✔ | ✔ | ✖ | Positive integers per glyph. |
| `scales` | ✔ | ✔ | ✔ | ✖ | Each pan must actually balance. |
| `query` | ✔ | ✔ | ✔ | ✖ | Subject and unit must **not share a scale**. |

*Validates:* brute-forces every integer weighting; the ratio must be **unique** and a positive integer; the correct option equals it; at least one substitution is required. Language-free by construction.

### `LNG_001` Analogy

| Field | Req | AI? | Val | Rev | Rule |
|---|:-:|:-:|:-:|:-:|---|
| `entry` | ✔ | ✔ | ✔ | ✔ | Index into `ANALOGIES`. Relation from the closed catalogue. |
| `correctIndex` | ✔ | ✔ | ✔ | ✖ | |

*Validates:* single-word options in the common band; no option appears in the relation text; the correct answer is not uniquely and markedly the longest.
*Human reviews:* whether the relation truly transfers, and whether the distractors are tempting rather than absurd.

### `LNG_002` Odd Word Out

| Field | Req | AI? | Val | Rev | Rule |
|---|:-:|:-:|:-:|:-:|---|
| `set` | ✔ | **✖** | ✔ | ✔ | Index into `ODD_WORD_SETS`. |

*Validates:* **leave-one-out** — exactly one word can be removed such that the other three share a category it lacks. Proven from the curated `membership`, never from a model's claim.
*Why AI may not propose the set:* the validator is only as good as the ontology behind it. A model adding `TOMATO: ['vegetable']` breaks it silently.

### `ATT_001` Symbol Sweep

| Field | Req | AI? | Val | Rev | Rule |
|---|:-:|:-:|:-:|:-:|---|
| `target`, `distractors` | ✔ | ✔ | ✔ | ✖ | ≥2 distractor glyphs, else it is a counting task. |
| `rows`, `columns` | ✔ | ✔ | ✔ | ✖ | ≤5 columns, or tiles fall below 48dp at 320dp. |
| `targetCount` | ✔ | ✔ | ✔ | ✖ | ≥5, and fewer than the distractors. |
| `durationMs` | ✔ | ✔ | ✔ | ✖ | ≥ the scoring limit. Multi-second, never a reflex test. |

### `ATT_003` Rapid Classification

| Field | Req | AI? | Val | Rev | Rule |
|---|:-:|:-:|:-:|:-:|---|
| `rule` | ✔ | ✔ | ✔ | ✔ | Key into `CLASSIFICATION_RULES`. |
| `items` | ✔ | ✔ | ✔ | ✖ | Even, so the two buckets balance exactly. |
| `durationMs` | ✔ | ✔ | ✔ | ✖ | ≥ the scoring limit. |

*Validates:* every glyph is in the curated alphabet (no borderline symbols); every item's bucket matches the curated table; buckets are 40–60%, so one-sided tapping cannot win.

---

## 6. Validation workflow

`npm test` builds every seed and runs `validatePuzzle` on all 250. A single failure fails the build.

The validators are:

- **Deterministic.** No sampling, no thresholds, no model.
- **Independent.** They re-derive the answer with their own implementation of the maths.
- **Specific.** A failure names the rule, not a score. Core Spec §5: *never a silent "best effort."*
- **Able to go red.** `npm test` mutates four puzzles on purpose — a mis-flagged sweep target, a wrong matrix answer key, an ambiguous word set, an unbalanced scale — and asserts each is rejected. A validator that cannot fail is decoration.

**Nothing reaches a human reviewer until every validator passes.** Reviewer attention is the scarcest resource in this whole system; spending it on a puzzle a program could have rejected is the most expensive mistake the pipeline can make.

---

## 7. Review workflow

The validator proves the puzzle is *correct*. A human decides whether it is *good*.

Review, in order, one engine at a time:

1. **Play it.** Not read it. Dev pack switcher, real device where possible.
2. **Is the answer obvious for the wrong reason?** Formatting, length, position, a distractor nobody would pick.
3. **Is a distractor tempting?** A puzzle whose wrong answers are absurd has no wrong answers.
4. **Does the explanation teach?** It must name the rule, not restate the answer.
5. **Any cultural assumption?** English-first is an accepted trade-off. Cultural knowledge is not.
6. **Would you enjoy this at 7am?**

`npm run audit` assists — it flags near-duplicates, distractor fatigue, hedged wording, weak explanations, difficulty drift. It does not replace judgement, and it does not gate the build.

**Split review across sessions.** Judgement degrades by candidate #150 in a single sitting; that is exactly how a bad puzzle slips through a good pipeline (Core Spec §4).

---

## 8. Scheduling workflow

`src/data/packs.ts` assembles 50 packs from the library. It is a pure function of the pack index — no randomness, no clock — so pack *n* holds the same five puzzles on every device, forever.

It satisfies two constraints simultaneously:

**Rotation (Core Spec §5).** Within a category the engine cycles, so the same engine never appears on consecutive days, and every engine appears within any 14-pack window. Enforced by `npm test`.

**Difficulty composition (Core Spec §7).** Each pack targets 1 easy, 2 medium, 1 hard non-speed puzzle plus the speed slot. The *role* rotates: Logic is not permanently the hard one.

### ⚠ The rotation floor, and where we actually stand

Exhaustively searching every 7-day schedule for one category:

| Engines in the category | Minimum weekly cap that can fill a week |
|---|---|
| 2 | **4** |
| 3 | 3 |
| 4 | **2** ← the Core Spec's target |

**Two engines can never fill a week at the intended cap.** As of **Phase 3**, every category clears the floor:

| Category | Engines | Minimum cap |
|---|---|---|
| Observation | 3 | 3 |
| Pattern | 3 | 3 |
| Logic | 3 | 3 |
| Language Logic | 3 | 3 |
| Attention Speed | 3 | 3 |

All five categories now hold three engines, so a 7-day week is schedulable at `weekly_cap: 3` with no engine repeating on consecutive days — the setting the packs actually use. `PAT_003`, `LOG_003`, `LNG_003` and `ATT_002` were built specifically to reach this.

The intended cap of **2** is still out of reach (it needs a *fourth* engine per category — `PAT_004`, `LOG_004`, `LNG_004`, `ATT_004`). That is a v1.1 goal, not a v1.0 blocker: cap 3 is a conscious, permitted setting (the Core Spec marks it "configurable"), and it means a player sees a given engine at most three times a week rather than four.

One residual property is inherent to three-engines-per-category on a fixed cycle: the *five-engine tuple* has period 3, so only three distinct tuples appear across the pool. This is invisible to a once-daily player — what they experience is a different engine per category each day, never the same engine twice running — and it cannot be removed by phase-shifting (five period-3 cycles have a combined period of 3 however they are offset). Only a fourth engine per category changes it.

`npm run audit` prints the live rotation figures every run.

---

## 9. Retirement workflow

Content leaves in one of four ways. Nothing is ever deleted — an archived attempt must remain reconstructable (Core Spec §2.5).

| Route | Trigger | Action |
|---|---|---|
| **Void** | Level-3 incident: two correct answers, no correct answer, unsolvable, scoring bug. | Remove from scoring, rescale that day's BrewScores 0–80 → 0–100, in-app notice. Never hot-swap a replacement (§10). |
| **Retire** | Empirical difficulty far from authored intent; high report rate; high abandon rate. | Withdraw from future scheduling. Keep in the library, marked. |
| **Deprecate a glyph** | It renders wrong on a real device. | Remove from the ontology. **Every puzzle using it is retired**, because the puzzle is now unsolvable, not merely ugly. |
| **Retire an engine** | Catalog v1.3: retire the weakest engine by data. | All its content retires with it. A catalog that only grows is a catalog nobody curates. |

**Retirement is a scheduling decision, not a deletion.** A retired puzzle that was ever live must still be reconstructable to answer a score dispute.

---

## 10. Command reference

| Command | What it does | Gates the build? |
|---|---|---|
| `npm test` | Builds every seed, validates all 250 puzzles, checks packs, rotation, scoring, determinism. | **yes** |
| `npm run audit` | Duplicate concepts, distractor reuse, explanation quality, ambiguous wording, difficulty distribution, engine usage, rotation feasibility. | validator + duplicate failures only |
| `npm run typecheck` | `tsc --noEmit`. | yes |
| `npm run web` | Play the packs. | — |

---

## 11. When AI generation arrives (Phase 3)

Everything above already assumes it. The seam is exactly one function per engine:

```
model  ──▶  seed  ──▶  builder  ──▶  validator  ──▶  human  ──▶  approved
              ▲                          │
              └──────── rejected ────────┘
```

The model's whole job is to **propose a seed**. It never touches a `Puzzle`, an option, a distractor, or an explanation. Those are computed.

Rules that must survive the transition:

1. A model may read the ontologies. It may never extend them.
2. A model's output is a seed, and a seed is validated before a human sees it.
3. A rejected seed is *reported with its broken rule*, and fed back into prompt calibration — never silently retried.
4. `LNG_002` Odd Word Out stays human-seeded until the ontology is large enough that a model choosing from it cannot exhaust it.
5. Generation is non-deterministic; **everything downstream of the approval gate is not.** That boundary is the product (Core Spec §2.5).
