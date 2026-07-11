# BrainBrew — Engine Catalog (Tier 2)

**Status:** Phase 0.8 design output. **15 of 20 engines built as of Phase 3** — the full Version 1 set. Deferred: OBS_004 Pair Find *(built early)*, PAT_004, LOG_004, LNG_004, ATT_004.
**Relationship to the Core Spec:** this document fills the gap Core Spec §3 explicitly leaves open — *"Full engine catalog for Pattern / Logic / Language Logic / Attention Speed is not yet fully specified."* It is subordinate to the Core Spec. Where the two disagree, the Core Spec wins and this document is wrong.

**What this is:** the complete, human-designed set of puzzle *mechanics* BrainBrew will run on for years. Twenty engines across five fixed categories.

**What this is not:** content. No puzzles are authored here beyond one worked example per engine. Mass content generation begins only after this catalog is approved.

> **AI generates content. Humans design engines.**
> An engine's rules, UI, validation and scoring are fixed by a person, once. AI's only job is filling that fixed shape with new numbers, shapes, word sets and scenarios. AI is never asked to invent a mechanic. (Core Spec §2.4)

**Where this ends up:** each engine below becomes one row in the `puzzle_engines` Supabase table (Core Spec §3). This document is the design record; the table is the runtime source of truth. Every field in the registry has a value specified here.

---

## 1. Admission criteria

Every engine in this catalog had to pass all eight gates. Any engine failing even one was rejected — the rejections are listed in §5, with reasons.

| # | Gate | Why it is disqualifying |
|---|---|---|
| 1 | **Enjoyable** | A daily ritual survives on wanting to open it. A puzzle that feels like homework kills the streak. |
| 2 | **Fair** | No engine may reward device quality, network latency, or prior exposure to a puzzle genre. |
| 3 | **Language-light** | Only Language Logic may depend on English. Everywhere else, English dependence is a defect. |
| 4 | **Accessible** | Must satisfy the §13 profile in full — not "mostly". |
| 5 | **Endlessly generatable** | AI must be able to produce hundreds of distinct, correct instances from a fixed prompt template. |
| 6 | **Automatically validatable** | A deterministic program must be able to prove a candidate has exactly one correct answer. If only a human can tell, it does not ship. |
| 7 | **One-sentence explainable** | If the instruction needs a paragraph, the player has already lost 20 seconds of a 4-minute session. |
| 8 | **Distinct** | It must *feel* different to the player, not merely differ in the code. Two engines with the same interaction and the same skill are one engine. |

Gate 6 is the harshest and did most of the rejecting. Gate 8 did most of the merging.

---

## 2. Cross-cutting baselines

These apply to **every** engine. Per-engine sections list only the deltas, so this document does not repeat itself twenty times.

### 2.1 Accessibility baseline (Core Spec §13)

- **Colour-safe.** No engine may encode the answer in hue. Every distinction is shape, orientation, count, fill, or position. Colour is decoration and feedback, never information. Feedback colour is always paired with a mark (`✓ ◐ ✕`) or a word.
- **High-contrast compatible.** All informational glyphs render at ≥4.5:1 against their tile.
- **Screen-scaling.** Every engine must be playable at 320dp width. Grids reflow, never shrink below the tap-target floor.
- **Left/right-handed neutral.** No engine places its only interactive control in a screen corner.
- **No audio dependency.** Nothing is signalled by sound.
- **No flashing content.** Engines with a blank interval (Memory Flash, Change Detection) must transition to a *neutral surface at the app's own background luminance* — never white, never a luminance spike. This is a hard requirement, not a preference.
- **Minimum tap target 48dp**, always, including grid cells at 320dp.

### 2.2 Validation baseline (Core Spec §4, stage 2)

Every candidate puzzle, in every engine, must pass automatically before a human ever sees it:

1. **Exactly one correct answer.** Proven by a deterministic checker, not asserted by the model.
2. **All options unique** — by id and by rendered label.
3. **Answer not inferable from formatting** — correct option is not systematically longest, shortest, or positionally biased. Option order is shuffled at generation, and the shuffle is stored.
4. **Explanation present, and it actually explains** — it must reference the rule, not restate the answer.
5. **No cultural, political, religious, or geographic knowledge required.** English-first is an accepted trade-off; *cultural* knowledge is not.
6. **Not a near-duplicate** of a recent puzzle (exact hash, template match, embedding similarity — Core Spec §4).
7. **Solvable within the engine's stated time envelope.**

### 2.3 Scoring baseline (Core Spec §8)

- 20 points max per puzzle: **14 accuracy + up to 6 speed**.
- Wrong answer: 0 points, no speed bonus.
- **Partial credit** is permitted only on engines whose answer is a *set* or a *sequence* rather than a single choice: Symbol Sweep, Rapid Classification, Memory Flash, Ordering, Sentence Ordering. On these, accuracy points scale with the fraction correct, and false selections subtract. The speed bonus is multiplied by accuracy, so a fast sloppy answer can never beat a slower clean one.
- Attention Speed is **accuracy-first, completion-time second**, never raw reaction milliseconds, and is bounded to the same 20 points as every other category so it can never dominate a BrewScore.
- **No engine may be graded from client-only state.** The client submits the answer and an aggregate (hits, false positives, elapsed); the server re-derives the score from stored content. Any engine requiring per-tap client timing to grade is disqualified.

### 2.4 Session time budget

A pack is five puzzles in roughly four minutes (Core Spec §1).

```
240s session
 −50s  reveal + explanation reading (5 × ~10s)
 ────
 190s  of actual solving  →  ~38s average per puzzle
```

Attention Speed consumes 15–25s of that, which buys the other four categories 40–45s each. **An engine whose typical solve time exceeds ~60s cannot ship in a daily pack**, however good it is. This single constraint rejected two otherwise-excellent engines (§5).

### 2.5 Difficulty scale

`1` trivial → `5` hard. Target pack composition is 1 easy, 2 medium, 1 hard, 1 speed-based (Core Spec §7). Each engine declares the band it can *safely* generate within; the scheduler never asks an engine for a difficulty outside its range.

---

## 3. The catalog

Twenty engines. Five per category is the design target; four per category is what survived the gates. Engines marked ✅ are already built and shipped in Phase 0.5.

| ID | Name | Category | V1? |
|---|---|---|---|
| `OBS_001` | Odd One Out ✅ | Observation | **Ship** |
| `OBS_002` | Spot the Difference | Observation | **Ship** |
| `OBS_003` | Rotation Match | Observation | **Ship** |
| `OBS_004` | Pair Find | Observation | Defer |
| `PAT_001` | Sequence Completion ✅ | Pattern | **Ship** |
| `PAT_002` | Matrix Completion | Pattern | **Ship** |
| `PAT_003` | Sequence Repair | Pattern | **Ship** |
| `PAT_004` | Rule Detection | Pattern | Defer |
| `LOG_001` | Deduction ✅ | Logic | **Ship** |
| `LOG_002` | Balance Scales | Logic | **Ship** |
| `LOG_003` | Ordering | Logic | **Ship** |
| `LOG_004` | Truth Statements | Logic | Defer |
| `LNG_001` | Analogy ✅ | Language Logic | **Ship** |
| `LNG_002` | Odd Word Out | Language Logic | **Ship** |
| `LNG_003` | Sentence Ordering | Language Logic | **Ship** |
| `LNG_004` | Connective Logic | Language Logic | Defer |
| `ATT_001` | Symbol Sweep ✅ | Attention Speed | **Ship** |
| `ATT_002` | Memory Flash | Attention Speed | **Ship** |
| `ATT_003` | Rapid Classification | Attention Speed | **Ship** |
| `ATT_004` | Change Detection | Attention Speed | Defer |

---

## OBSERVATION

*Visual perception under no time pressure. The eye, not the clock.*

---

### `OBS_001` — Odd One Out ✅ *shipped*

**One sentence:** One tile in this grid is different — tap it.

**Description.** A grid of 12–16 identical glyphs with exactly one that differs by orientation, internal detail, or fill. The player taps the outlier.

**Why it is fun.** The click of recognition. It is the cheapest possible "I see it" moment, and it works as the pack's opener because it warms the eye up without demanding thought. Difficulty scales smoothly and honestly: from `▲` among `△` (instant) to `◐` among `◑` (a real scan).

**Difficulty range** 1–4 · **Typical solve time** 6–20s
**UI** Square grid, 4–5 columns, tap one tile. `ObservationEngine`
**Registry** `estimated_time: 15s` · `weekly_cap: 3` · `min_days_between: 2` · `rotation_weight: 1.0`

**Accessibility.** Difference must be a *shape* difference — orientation, missing stroke, altered internal detail, changed fill fraction. Never hue. Glyph pairs must be verified in greyscale before approval. At 320dp a 4-column grid yields 64dp cells; 5 columns yields 51dp — both clear the floor.

**Validation.**
- Exactly one tile's glyph differs from the modal glyph.
- The odd glyph is not merely a colour variant of the majority glyph.
- Odd tile is not at index 0 or the final index (positional bias).
- Glyph pair drawn from an approved, greyscale-verified pair list.

**Scoring.** Single choice. 14 + speed. Wrong → 0.

**AI generation.** Given: an approved glyph-pair list, a grid size, a difficulty band. The model picks a pair whose perceptual distance matches the band and an odd index. The model does **not** invent glyphs — the pair list is human-curated, because font rendering of exotic Unicode is a real risk (see §8).

**Example.**
```
◐ ◐ ◐ ◐
◐ ◐ ◐ ◑     → answer: index 7
◐ ◐ ◐ ◐
```
*Explanation: "Every circle is filled on its left side — except one, filled on its right."*

---

### `OBS_002` — Spot the Difference

**One sentence:** Two grids look identical, but one cell has changed — tap it.

**Description.** Two glyph grids, stacked vertically, identical except for exactly one cell whose glyph differs by orientation or internal detail. The player taps the changed cell in the lower grid.

**Why it is fun.** It is a *comparison* task, not a *search* task — the eye ping-pongs between two references instead of scanning one field. That is a genuinely different sensation from Odd One Out, which is why both earn a slot. It also has a satisfying failure mode: you know you're close, you just haven't found it.

**Difficulty range** 1–4 · **Typical solve time** 15–35s
**UI** Two stacked grids (never side-by-side — see accessibility), tap one cell of the lower grid. New component: `TwoGridCompare`.
**Registry** `estimated_time: 25s` · `weekly_cap: 3` · `min_days_between: 2` · `rotation_weight: 1.0`

**Accessibility.** Grids **stack vertically**, never side-by-side. Side-by-side at 320dp would require eight columns of glyphs, driving cells to ~35dp — below the tap floor and below legibility. Stacking costs vertical scroll and buys correctness. Grid capped at 4×3 so both fit one screen at 320dp without scrolling.

**Validation.**
- Grids differ in exactly one cell.
- The difference is shape-based, drawn from the approved pair list.
- The differing cell is not in a corner (too easy) nor dead-centre (positional bias).
- Both grids contain ≥3 distinct glyphs, so the player cannot solve it by counting one glyph type.

**Scoring.** Single choice. 14 + speed.

**AI generation.** Given a glyph alphabet and grid size, generate grid A, clone to B, mutate one cell using an approved transform (rotate, mirror, alter detail). Trivially validatable — the checker diffs the two matrices.

**Example.**
```
A:  ▲ ◆ ■ ▲          B:  ▲ ◆ ■ ▲
    ■ ▲ ◆ ■              ■ ▲ ◆ ■
    ◆ ■ ▲ ◆              ◆ ■ ▼ ◆     → answer: row 3, col 3
```
*Explanation: "In the second grid, one triangle points down."*

---

### `OBS_003` — Rotation Match

**One sentence:** Which of these four shapes is the shape above, just rotated?

**Description.** A target shape, drawn as filled cells on a small grid (a polyomino), plus four candidate shapes. Exactly one candidate is the target rotated by 90°, 180° or 270°. The others are near-misses: one is the target *mirrored*, one has a single cell moved, one is a different shape entirely.

**Why it is fun.** It is the only engine that asks the player to *manipulate* an image in their head rather than compare two of them. It produces a distinctive "turn it in your mind" sensation that nothing else in the catalog reproduces. The mirrored distractor is what makes it bite — a mirror image looks right until you actually rotate it.

**Difficulty range** 2–5 · **Typical solve time** 20–45s
**UI** Target shape above, 2×2 grid of candidate shapes below, tap one. New component: `ShapeGrid` (renders a boolean matrix as filled cells — no image assets, no SVG).
**Registry** `estimated_time: 32s` · `weekly_cap: 2` · `min_days_between: 3` · `rotation_weight: 0.9`

**Accessibility.** Shapes are boolean cell matrices rendered as Views — no font dependency, no image assets, scales cleanly. Each candidate is a single 48dp+ tap target as a whole (the player taps the shape, not a cell within it). Mental rotation ability varies across the population more than most visual skills, so this engine is capped at `rotation_weight: 0.9` and `weekly_cap: 2` — it should never be the face of the product.

**Validation.**
- Exactly one candidate equals a rotation of the target (rotate the matrix 4 ways, compare).
- **Every candidate has the same number of filled cells as the target.** Without this, a player solves the puzzle by *counting* instead of rotating, and the engine measures nothing. (I got this wrong in my own first draft of the example below — three of four distractors were eliminable at a glance. It is the least obvious and most important rule here.)
- **No candidate is reachable by rotation other than the intended one.** Reject any target with rotational symmetry — a symmetric shape makes two candidates identical, and the puzzle has no unique answer. This check is mandatory and non-obvious.
- The mirrored distractor must *not* also be a rotation (i.e. the shape must be chiral).
- The mutated distractor differs from the target by exactly one cell *moved*, never added or removed.

**Scoring.** Single choice. 14 + speed.

**AI generation.** The model does not draw. It emits a boolean matrix (e.g. 4×4) and a rotation amount; the generator derives the candidates programmatically. This is the safest generation shape in the whole catalog — the model's only creative act is choosing an interesting polyomino, and every downstream artefact is computed.

**Example.** Target (`#` filled, 4 cells):
```
# . .
# . .
# # .
```
Candidates — all four have exactly 4 filled cells:
```
   A)  # # #        B)  . . #        C)  # # .        D)  # # #
       # . .            . . #            # . .            . # .
       . . .            . # #            # . .            . . .
```
→ **A** — the target rotated 90° clockwise.
*B is the mirror image (looks right, isn't). C has one cell moved. D is a different shape.*

*Verified: the target is chiral and has no rotational symmetry, exactly one candidate is a rotation of it, and all four candidates have identical cell counts — so counting cells reveals nothing.*

---

### `OBS_004` — Pair Find · *deferred to v1.1*

**One sentence:** Exactly two of these tiles are identical — tap them both.

**Description.** 12–15 tiles, every glyph unique except one matching pair. The player taps both members of the pair.

**Why it is fun.** It inverts Odd One Out: instead of finding the one that differs, you find the two that agree. That inversion changes the search strategy completely — you cannot solve it by spotting an anomaly, you must build a mental index. It is also the only Observation engine with a two-tap answer, which makes it feel weightier.

**Difficulty range** 2–4 · **Typical solve time** 20–40s
**UI** Grid, tap two tiles; first tap is selectable/deselectable before commit. Reuses `Grid`, needs multi-select state.
**Registry** `estimated_time: 30s` · `weekly_cap: 2` · `min_days_between: 3` · `rotation_weight: 0.8`

**Accessibility.** Identical to Odd One Out. Requires a visible "selected" state distinct from "correct" — shape/border, not colour alone. First tap must be reversible, or a misfire costs the whole puzzle unfairly.

**Validation.**
- Exactly one glyph appears exactly twice; every other glyph appears exactly once.
- The two pair members are not adjacent (trivial) and not in the same row or column (too easy to scan).
- Alphabet size ≥ tile count − 1.

**Scoring.** Both taps correct → 14 + speed. One correct → 0 (this is a single answer expressed as two taps, not a set — partial credit here would reward guessing half the board).

**Why deferred.** It is the weakest of the four Observation engines on gate 8 (*distinct*). The player's action — scan a grid, tap a tile — is visually identical to Odd One Out, and early playtesting is likely to show they blur together. It ships once we have empirical difficulty data to prove they don't. Nothing else about it is weak.

---

## PATTERN

*Analytical structure. Find the rule, then use it.*

> **This was the hardest category to design, and it is still the weakest.** Nearly every "pattern" idea collapses into *show a sequence, pick the next term*. Three of the five suggested engines (Number Sequence, Shape Sequence, Symbol Progression) were the same engine wearing different tokens. See §4.

---

### `PAT_001` — Sequence Completion ✅ *shipped*

**One sentence:** What comes next in this sequence?

**Description.** Five terms of a rule-governed sequence, a blank, four options. Terms may be **numbers, shapes, or symbols** — the token type is a *content parameter*, not a separate engine.

**Why it is fun.** The purest "aha" in the app: the rule snaps into place and the answer is suddenly obvious. It is also the most legible puzzle type in existence — every player on earth has met one.

**Difficulty range** 1–5 · **Typical solve time** 10–40s
**UI** Chip row (never wraps), four option rows. `PatternEngine`
**Registry** `estimated_time: 25s` · `weekly_cap: 3` · `min_days_between: 2` · `rotation_weight: 1.2` *(highest weight in the catalog — it is the most reliable engine we have)*

**Accessibility.** Shape and symbol variants must not encode the rule in colour. Numeric variants must stay within 3 digits so the chip row fits 320dp without wrapping — a sequence that breaks across two lines stops reading as a sequence.

**Validation.**
- The stated rule reproduces every visible term.
- **No simpler rule fits all visible terms and yields a different next term.** This is the real check, and it is why sequences are capped at 5 visible terms — fewer terms means more ambiguity.
- Exactly one option matches the rule's next term.
- Distractors are *near-misses* generated by perturbing the rule (off-by-one, wrong operation, right operation wrong operand), never random numbers.

**Scoring.** Single choice. 14 + speed.

**AI generation.** Model emits a rule from an approved rule family (arithmetic, geometric, polynomial, recurrence, alternating) plus its parameters. The generator computes the terms and distractors. The model never writes the numbers directly — that is how you get sequences with two valid continuations.

**Example.** `2, 6, 12, 20, 30, ?` → options `36 · 40 · 42 · 44` → **42**
*Explanation: "The gaps grow by two each step: +4, +6, +8, +10, then +12. Each term is n × (n+1)."*

---

### `PAT_002` — Matrix Completion

**One sentence:** One cell of this grid is missing — which option belongs there?

**Description.** A 3×3 grid of figures varying along 2–3 independent attributes (shape, count, fill, orientation). Each row and each column obeys a rule. The bottom-right cell is blank. Four options; one satisfies every rule.

**Why it is fun.** It is the single most respected pattern task ever designed (the Raven's matrix lineage), and it earns that reputation: it rewards *systematic* thinking rather than a flash of insight. Finding the row rule, then the column rule, then intersecting them is genuinely satisfying — and it is the best hard-difficulty puzzle in the catalog.

**Difficulty range** 2–5 · **Typical solve time** 30–60s
**UI** 3×3 figure grid with an empty cell, four options below. Reuses `ShapeGrid` + `MultipleChoice`.
**Registry** `estimated_time: 45s` · `weekly_cap: 2` · `min_days_between: 3` · `rotation_weight: 1.0`

**Accessibility.** Attributes must be shape/count/fill/orientation — **never colour**. Fill means outline vs. half vs. solid, which survives greyscale. At 320dp a 3×3 figure grid plus four option rows exceeds one screen; the grid must remain visible while options scroll, or the option rows must be compact. This is a real layout constraint, not a nicety.

**Validation.**
- Every row and every column satisfies its declared rule, for all eight filled cells.
- Exactly one option satisfies all rules for the missing cell.
- Each distractor violates **exactly one** attribute rule (near-miss), so no distractor is dismissible at a glance.
- No attribute is constant across the whole grid (a constant attribute is decoration masquerading as a rule).

**Scoring.** Single choice. 14 + speed.

**AI generation.** Model emits an attribute schema and a rule per row/column (e.g. *"shape cycles"*, *"count increases by one"*, *"fill is a Latin square"*). The generator renders all nine cells and derives distractors by single-attribute perturbation. Fully computable.

**Implementation note (Phase 1).** The shape alphabet shipped as {circle, square, **diamond**}, not triangle: a triangle cannot carry an unambiguous outline/half/solid fill drawn from Views. `half` means *the lower half in screen space* on every shape — the diamond fill layer is counter-rotated, so `half` never reads as a diagonal cut. `fill` is load-bearing here; it has to look identical on all three shapes.

**Example.** Attributes: *shape* ∈ {circle, square, diamond}, *count* ∈ {1,2,3}, *fill* ∈ {outline, half, solid}.
Rule: shape cycles along rows; count increases along columns; fill is a Latin square.

|  | col 1 | col 2 | col 3 |
|---|---|---|---|
| **row 1** | 1 circle, outline | 2 circles, half | 3 circles, solid |
| **row 2** | 1 square, half | 2 squares, solid | 3 squares, outline |
| **row 3** | 1 diamond, solid | 2 diamonds, outline | **?** |

→ **3 diamonds, half fill.**
*Explanation: "Rows fix the shape, columns fix the count, and each fill appears once per row and once per column."*

---

### `PAT_003` — Sequence Repair

**One sentence:** One term in this sequence is wrong — tap it.

**Description.** Six terms of a rule-governed sequence with exactly one term corrupted. The player taps the offending term. No options; the sequence *is* the answer space.

**Why it is fun.** It flips Sequence Completion from *extrapolation* to *verification*, and those are different mental acts. It is also faster and more tactile — you tap the sequence itself rather than a list of options — which makes it a good change of pace mid-pack. And the failure mode is instructive: you find the break by checking, not guessing.

**Difficulty range** 2–5 · **Typical solve time** 20–45s
**UI** Chip row where each chip is a 48dp tap target. Reuses `PatternEngine`'s chip row, made tappable.
**Registry** `estimated_time: 32s` · `weekly_cap: 2` · `min_days_between: 3` · `rotation_weight: 1.0`

**Accessibility.** Chips must reach 48dp *including* the six-chip row fitting 320dp — this forces ≤3-digit terms and tight chip padding. Already solved for `PAT_001`; reuse it.

**Validation.** This engine has the subtlest validator in the catalog and it must be written carefully:
- Fit the declared rule to the five uncorrupted terms; it must reproduce them exactly.
- **No alternative single-term repair yields a valid rule from an approved family.** If changing term 2 *or* term 5 both produce a clean geometric sequence, the puzzle has two correct answers and must be rejected. The checker must attempt a repair at every position and confirm exactly one succeeds.
- The corrupted term must not be the first or last (either can be "repaired" by simply shortening the sequence).
- The corruption must be large enough to be findable and small enough to be non-obvious (bounded relative delta).

**Scoring.** Single choice (one tap). 14 + speed.

**AI generation.** Model emits rule family + parameters + corruption index + delta. Generator computes everything. The uniqueness check above runs before a human sees it.

**Example.** `3, 6, 12, 24, 40, 96` → tap **40**
*Explanation: "Each term doubles. After 24 comes 48, not 40."*
*(Checker confirms: no other single-term change produces a valid sequence from any approved rule family.)*

---

### `PAT_004` — Rule Detection · *deferred to v1.2*

**One sentence:** These three figures follow a hidden rule and these three break it — which option follows it?

**Description.** Three positive examples, three negative examples, four candidates. Exactly one candidate obeys the hidden rule.

**Why it is fun.** It is *induction* rather than *pattern completion* — the player builds a hypothesis and tests it. That is a genuinely distinct pleasure and it is the closest the app gets to the feeling of science.

**Difficulty range** 3–5 · **Typical solve time** 40–70s
**UI** Two labelled example rows, four candidates. Reuses `ShapeGrid` + `MultipleChoice`.
**Registry** `estimated_time: 55s` · `weekly_cap: 1` · `min_days_between: 5` · `rotation_weight: 0.6`

**Accessibility.** Same attribute constraints as Matrix Completion. Content-heavy: ten figures plus four options is a lot of screen at 320dp.

**Validation.** *This is the hardest validator in the catalog, and the reason for deferral.*
- The intended rule accepts all three positives and rejects all three negatives.
- Exactly one candidate satisfies the intended rule.
- **Rule ambiguity check:** enumerate every rule in the approved rule space. *Exactly one* must be consistent with all six examples. If two distinct rules both fit the examples but select different candidates, the puzzle is ambiguous and must be rejected.

  This is why the negative examples exist. Without them, positives `{square(4), hexagon(6), octagon(8)}` are consistent with both *"even number of sides"* and *"more than three sides"* — which select different candidates. The negatives must be chosen specifically to eliminate every competing rule.

**Scoring.** Single choice. 14 + speed.

**AI generation.** Model proposes a rule from the approved space; the generator searches for a positive/negative example set that *uniquely identifies* it. Generation may fail and must be allowed to fail — the scheduler reports infeasibility rather than shipping an ambiguous puzzle (Core Spec §5).

**Why deferred.** It clears every gate on paper and it is the most intellectually interesting engine here. But its validator requires an enumerable rule space and a uniqueness search, and its solve time (40–70s) sits at the very edge of the session budget (§2.4). Both are solvable; neither is solvable *quickly*. Ship it once the content pipeline is mature and empirical timing data exists.

---

## LOGIC

*Deduction from stated premises. No outside knowledge, ever.*

---

### `LOG_001` — Deduction ✅ *shipped*

**One sentence:** If both statements are true, which of these must also be true?

**Description.** Two premises, four candidate conclusions. Exactly one is entailed. The distractors are the classic fallacies: affirming the consequent, illicit conversion, and an unstated claim.

**Why it is fun.** The satisfaction is in *rejecting* the plausible-sounding options. A well-built distractor feels true until you check it, and catching that is the whole pleasure.

**Difficulty range** 2–5 · **Typical solve time** 20–50s
**UI** Numbered premise card, four option rows. `LogicEngine`
**Registry** `estimated_time: 38s` · `weekly_cap: 3` · `min_days_between: 2` · `rotation_weight: 1.1`

**Accessibility.** Text-based, so it inherits English dependence — an accepted cost in Logic, but see `LOG_002`. Premises must use concrete, culture-neutral nouns (books, keys, doors). Never proper nouns from any specific culture. Reading load capped: ≤ 18 words per premise, ≤ 14 per option.

**Validation.**
- Formalise premises and each option; a solver confirms exactly one option is entailed.
- Each distractor maps to a **named fallacy**, and the explanation names it.
- No option is entailed *and* trivially restated from a single premise unless that is deliberately the answer (see the worked example — that is a legitimate hard variant, because the tempting option is the invalid one).
- No world knowledge required beyond the premises.

**Scoring.** Single choice. 14 + speed.

**AI generation.** Model emits a logical form (`∀x P(x)→Q(x)`, `¬∃x Q(x)∧R(x)`) plus a concrete lexical skin. The generator instantiates the skin and derives distractors from the fallacy catalogue. The logic is computed; only the nouns are creative.

**Example.**
> 1. Every book on the top shelf is a hardcover.
> 2. No hardcover book is currently on loan.

→ **"No book on the top shelf is on loan."**
*Explanation: "Top-shelf books are all hardcovers, and no hardcover is on loan — so no top-shelf book can be on loan. The others add claims the two statements never make."*

---

### `LOG_002` — Balance Scales

**One sentence:** Two balanced scales show how these shapes compare — how many squares balance one circle?

**Description.** Two (or three) balance diagrams establishing weight relations between 3–4 abstract shapes. The player solves for an unknown ratio. Four numeric options.

**Why it is fun.** It is logic you can *see*. The reasoning is real substitution and elimination, but it arrives through a picture rather than a paragraph. It feels like a small machine you can operate.

**Difficulty range** 2–5 · **Typical solve time** 25–50s
**UI** Two scale diagrams (drawn with Views — a beam, two pans, shape glyphs), four option rows. New component: `BalanceScale`.
**Registry** `estimated_time: 38s` · `weekly_cap: 3` · `min_days_between: 2` · `rotation_weight: 1.1`

**Accessibility.** Shapes distinguished by form, not colour. The beam must be visibly level (it is always balanced — the diagram states a fact, it does not tip). No animation.

> **This engine exists to fix a structural fairness problem.** Logic was, until now, entirely text-based, which quietly disadvantaged non-native English speakers in a category that is *not supposed to* test language (Core Spec §2.1, §3). Balance Scales is language-free — the prompt is a single sentence and the puzzle is a diagram. It carries near-zero reading load and belongs in every week's rotation. This was the most valuable discovery of this design phase.

**Validation.**
- The linear system has a **unique** solution (rank check), and the answer is a positive integer or a clean fraction (no `2.7 squares`).
- All shape weights are positive integers under some scaling.
- Exactly one option equals the solution; distractors come from plausible arithmetic slips (inverted ratio, one substitution short, off-by-one).
- The system must require **at least one substitution** — if the answer is readable off a single scale, difficulty is 1 and the puzzle is rejected above band 2.

**Scoring.** Single choice. 14 + speed.

**AI generation.** Model emits integer weights per shape and two scale equations. The generator verifies uniqueness and renders. Distractors computed. The model's creative act is choosing weights that produce an interesting substitution chain — everything else is arithmetic.

**Example.**
```
Scale 1:   ● ●   balances   ▲ ▲ ▲
Scale 2:    ▲    balances    ■ ■
```
**How many ■ balance one ●?** → options `2 · 3 · 4 · 6` → **3**
*Explanation: "Two circles equal three triangles, so one circle is one and a half triangles. Each triangle is two squares, so one circle is three squares."*

---

### `LOG_003` — Ordering

**One sentence:** Use the clues to put these four items in order — tap them from first to last.

**Description.** Three or four relational clues ("A finished before B", "C was not last") that admit exactly one total ordering of four items. The player taps the items into sequence.

**Why it is fun.** It has a *build* interaction rather than a *choose* interaction — the answer accumulates under your finger. Committing to a first item and feeling the rest fall into place is a distinct pleasure from picking one of four options, and it makes Logic feel less like an exam.

**Difficulty range** 2–5 · **Typical solve time** 30–55s
**UI** Clue card, then four item chips; tap to append to an answer strip, tap again to remove. **Tap-to-order, never drag** — drag targets are an accessibility failure on small screens and a nightmare with assistive tech. New component: `OrderingInput` (shared with `LNG_003`).
**Registry** `estimated_time: 45s` · `weekly_cap: 2` · `min_days_between: 3` · `rotation_weight: 0.9`

**Accessibility.** Tap-to-order only. The answer strip must announce position ("2 of 4"). Every chip ≥48dp. Removal must be possible before commit — an un-undoable misfire is unfair. Reading load: ≤ 12 words per clue.

**Validation.**
- Enumerate all 4! = 24 permutations; **exactly one** satisfies every clue.
- Every clue is *load-bearing*: removing any single clue must make the solution non-unique. A redundant clue is padding and inflates reading time for nothing.
- No clue references an item not in the set.

**Scoring.** **Partial credit** (a sequence, not a choice). Accuracy = fraction of items in their correct absolute position. Speed bonus multiplied by accuracy. A fully correct order → 14 + speed; two of four correct → 7 accuracy points, half the speed bonus. This is fair: getting three of four right genuinely is closer than getting none.

**AI generation.** Model emits an intended ordering plus a clue set; the generator brute-forces uniqueness and load-bearingness, and rejects otherwise. Cheap and total — 24 permutations is nothing.

**Example.**
> - Rosa finished before Ken.
> - Ken finished before Mia.
> - Ada finished last.

→ **Rosa, Ken, Mia, Ada**
*Explanation: "Rosa before Ken before Mia gives one chain, and Ada is fixed at the end."*

---

### `LOG_004` — Truth Statements · *deferred to v1.2*

**One sentence:** One of these three speakers always lies — who is it?

**Description.** Three speakers make claims about who lies. Exactly one assignment of truth-teller/liar labels is consistent.

**Why it is fun.** Self-reference is delicious. "If B is telling the truth, then A is lying, but A said…" is a small, complete detective story, and the moment the contradiction resolves is the best *aha* in the Logic category.

**Difficulty range** 3–5 · **Typical solve time** 45–90s
**UI** Speaker cards, four options (or three, one per speaker). Reuses `LogicEngine`.
**Registry** `estimated_time: 65s` · `weekly_cap: 1` · `min_days_between: 5` · `rotation_weight: 0.5`

**Accessibility.** Heavy reading load — three statements that must be held in working memory simultaneously. This compounds the English-first disadvantage more than any other Logic engine.

**Validation.** Brute-force all 2ⁿ truth assignments; exactly one must be consistent. Trivial for n ≤ 4 and completely reliable. *Validation is not the problem here.*

**Scoring.** Single choice. 14 + speed.

**Why deferred.** It **breaks the session time budget** (§2.4). At 45–90s typical solve time it consumes a quarter of the entire session, and at difficulty 5 it exceeds the whole 190s solving allowance for one of five puzzles. It also carries the highest reading load in the catalog, which is precisely the fairness cost we are trying to *reduce* in Logic. Capping it at three speakers keeps it under 60s and is the condition of its eventual entry. Excellent engine, wrong slot — it is a **practice-mode** engine before it is a daily-pack engine.

---

## LANGUAGE LOGIC

*Reasoning expressed through English — never vocabulary recall.*

> The guiding constraint (Core Spec §3): the original "Word Challenge" was redesigned precisely because a vocabulary quiz does not measure the same thing as the other four categories. **Every engine here must be solvable by a competent English speaker with an ordinary vocabulary.** If knowing an unusual word is the puzzle, the engine is rejected.

---

### `LNG_001` — Analogy ✅ *shipped*

**One sentence:** Complete the analogy: A is to B as C is to what?

**Description.** A stated relation between two common words, and a third word requiring the same relation. Four options, one correct.

**Why it is fun.** The relation is the puzzle, not the words. Recognising *"this pair is 'severe shortage of'"* and transporting it to a new noun is pure structural reasoning that happens to use language as its medium.

**Difficulty range** 2–5 · **Typical solve time** 12–35s
**UI** Two-line relation card, four option rows. `LanguageLogicEngine`
**Registry** `estimated_time: 25s` · `weekly_cap: 3` · `min_days_between: 2` · `rotation_weight: 1.1`

**Accessibility.** All four words must be within the most common ~5,000 English words. The *relation* carries the difficulty; the words never do.

**Validation.**
- Relation drawn from an approved, closed relation catalogue: `part→whole`, `cause→effect`, `intensity`, `scarcity-of`, `member→category`, `tool→function`, `before→after`.
- Exactly one option satisfies the relation.
- Distractors are **structurally typed**, one each: the *effect* of the answer, a *part* of the answer, an item from the same semantic field but the wrong relation. No random words — a random distractor is a giveaway.
- Every word passes a frequency-band check.

**Scoring.** Single choice. 14 + speed.

**AI generation.** Model picks a relation from the catalogue and instantiates both pairs, then the generator draws typed distractors from a curated lexicon. The relation catalogue is human-owned; AI never invents a relation type.

**Example.** `DROUGHT is to WATER` · `FAMINE is to ?` → `FOOD · HUNGER · HARVEST · WEATHER` → **FOOD**
*Explanation: "A drought is a severe shortage of water, so a famine is a severe shortage of food. Hunger is what a famine causes, not what it is a shortage of."*

---

### `LNG_002` — Odd Word Out

**One sentence:** Three of these words share something — tap the one that doesn't.

**Description.** Four common words. Three belong to a single closed category; the fourth is related enough to be tempting but belongs to a different one.

**Why it is fun.** Categorisation is fast, confident thinking, and being *nearly* fooled is the fun. `HAMMER · SAW · DRILL · NAIL` is instant once you see it and maddening for the two seconds before.

**Difficulty range** 1–4 · **Typical solve time** 10–30s
**UI** Four option rows, tap one. Reuses `MultipleChoice`.
**Registry** `estimated_time: 20s` · `weekly_cap: 3` · `min_days_between: 2` · `rotation_weight: 1.0`

**Accessibility.** Words from the common band. Categories must be **universal**, never cultural — *tools*, *body parts*, *weather*, *shapes*. Never sports, holidays, cuisines, or brands.

**Validation.** *This engine's failure mode is ambiguity, and it is the most dangerous in the catalog.*
- The three in-group words share **exactly one** category from a human-curated closed category list.
- **The outlier must not form a valid group of three with any two of the others under any other listed category.** `WHALE · SHARK · DOLPHIN · TUNA` fails this: {whale, dolphin} are mammals and {shark, tuna} are fish — two groups of two, no unique outlier. The checker must test all four "leave-one-out" groupings and confirm exactly one produces a coherent category.
- Category membership is drawn from a curated ontology, **not from the model's assertion.** A model that claims *"a tomato is a vegetable"* will happily ship an ambiguous puzzle.

**Scoring.** Single choice. 14 + speed.

**AI generation.** The model proposes the four words; the *generator* verifies membership against the curated ontology and runs the leave-one-out check. The ontology is the moat — it is human-authored and grows slowly. This constrains generation volume, and that is acceptable.

**Example.** `HAMMER · SAW · DRILL · NAIL` → **NAIL**
*Explanation: "A hammer, a saw and a drill are all tools. A nail is what a tool works on."*

---

### `LNG_003` — Sentence Ordering

**One sentence:** These four fragments make one sentence — tap them in the right order.

**Description.** A coherent sentence split into four fragments, presented shuffled. The player taps them into order. Solvable from grammar, connectives and pronoun reference alone.

**Why it is fun.** It is reasoning about *structure*, which is the purest possible expression of "language logic" — no vocabulary, no trivia, just the shape of a sentence. And it shares the satisfying build-the-answer interaction of `LOG_003`.

**Difficulty range** 2–4 · **Typical solve time** 25–45s
**UI** Fragment chips + answer strip. **Reuses `OrderingInput` from `LOG_003`** — one component, two engines, two categories.
**Registry** `estimated_time: 35s` · `weekly_cap: 2` · `min_days_between: 3` · `rotation_weight: 0.9`

**Accessibility.** Common vocabulary. Fragments ≤ 6 words each so chips stay legible at 320dp. Tap-to-order, reversible, never drag.

**Validation.** *The weakest validator among the shipping Language engines. Treat with care.*
- Exactly one ordering must be grammatical **and** satisfy explicit structural constraints, and the generator must be able to *state* those constraints: a capitalised opening fragment, a terminal fragment ending in a full stop, a pronoun that must follow its antecedent, a connective that must not lead.
- The checker enumerates all 24 orderings and confirms exactly one satisfies every constraint.
- **Reject any sentence where two orderings are both grammatical.** English tolerates a lot of reordering; most candidate sentences will fail this and that is correct.
- Human review is mandatory on this engine even after automatic validation passes. It is the one engine where the checker can be satisfied and the puzzle still be arguable.

**Scoring.** **Partial credit** (a sequence). Accuracy = fraction of fragments in correct absolute position. Speed bonus scaled by accuracy.

**AI generation.** Model writes a sentence built around one explicit structural hinge (a pronoun with a clear antecedent, or a subordinating connective). The generator splits it and verifies uniqueness by enumeration.

**Example.** Fragments: `and she waited outside.` · `Nina arrived at nine,` · `The museum opens at ten.` · `so the doors were still locked,`
→ **"The museum opens at ten. / Nina arrived at nine, / so the doors were still locked, / and she waited outside."**
*Explanation: "Only one order puts the fact first, the consequence after its cause, and the pronoun after the name it refers to."*

---

### `LNG_004` — Connective Logic · *deferred to v1.1*

**One sentence:** Which connecting word makes this sentence logically true?

**Description.** A two-clause sentence with the connective removed. Four options from a closed set: `because · although · so · unless`. Exactly one preserves the logical relationship between the clauses.

**Why it is fun.** It quietly reveals that words like *because* and *although* are logical operators wearing everyday clothes. Getting it right feels like noticing something about your own language.

**Difficulty range** 2–4 · **Typical solve time** 15–35s
**UI** Sentence with a blank, four option rows. Reuses `MultipleChoice`.
**Registry** `estimated_time: 25s` · `weekly_cap: 2` · `min_days_between: 3` · `rotation_weight: 0.8`

**Accessibility.** Common vocabulary; the connective set is closed and taught early to English learners.

**Validation.**
- The clause pair has a declared logical relation (`cause`, `concession`, `consequence`, `condition`).
- Exactly one connective in the closed set is consistent with that relation; every other produces a false or incoherent statement.
- Both clauses independently sensible; neither contains the answer.

**Scoring.** Single choice. 14 + speed.

**Why deferred.** Gate 3 risk: it sits one bad content batch away from becoming a **grammar test**, which is exactly the failure mode the whole category was redesigned to escape. The engine is sound; the *content discipline* required to keep it logical rather than grammatical is not yet proven. Ship it after the review pipeline has a track record, and reject any candidate where a native speaker's ear — rather than the logic — picks the answer.

**Example.** `The path was flooded, ___ we took the ridge trail.` → `because · although · so · unless` → **so**
*Explanation: "The flood is the cause and the detour is the result, so the sentence needs a consequence word. 'Because' would reverse cause and effect."*

---

## ATTENTION SPEED

*Multi-second sustained attention. Never a reaction-time benchmark.*

> **The prohibition that defines this category** (Core Spec §3): raw millisecond reflex timing is a device benchmark in disguise — screen refresh rate, touch sampling, OS scheduling and network latency pollute the measurement more than human variance does. Every engine here spreads its task over **several seconds**, so latency noise becomes a negligible fraction of the signal. Any engine whose score depends on a single sub-second event is rejected on sight.

---

### `ATT_001` — Symbol Sweep ✅ *shipped*

**One sentence:** Tap every triangle and ignore everything else, before the clock runs out.

**Description.** A grid of 16–25 glyphs. Tap all instances of the target glyph within a fixed multi-second window. Gated behind a **Begin** button so reading the brief costs nothing.

**Why it is fun.** It is the only puzzle in the pack that makes your pulse rise slightly. Ending the session on it is deliberate — you leave with a small jolt rather than a furrowed brow.

**Difficulty range** 1–5 · **Typical solve time** 10–15s (window), plus untimed brief
**UI** Brief → Begin → grid + countdown. `AttentionSpeedEngine`
**Registry** `estimated_time: 20s` · `weekly_cap: 3` · `min_days_between: 2` · `rotation_weight: 1.2`

**Accessibility.** Target and distractors distinguished by **shape only**. Every tile ≥48dp at 320dp (5 columns → 51dp). No flashing. The clock starts on **Begin**, never on mount — reading speed is not the thing being measured.

**Validation.**
- `isTarget` is true for exactly the tiles whose glyph equals `targetGlyph`.
- ≥5 targets, and at least as many distractors as targets.
- ≥2 distinct distractor glyphs (one distractor type makes it a counting task).
- Grid fills complete rows; prompt names the target glyph.
- `durationMs ≥ timing.limitMs`.

**Scoring.** **Partial credit.** Accuracy = `(hits − falsePositives) / targets`, clamped to [0,1]. Accuracy points = `14 × accuracy`. Speed bonus = `6 × speedFactor × accuracy` — **speed is multiplied by accuracy**, so spraying the grid can never score. Tapping every tile scores exactly 0.

**AI generation.** Model emits a glyph alphabet, target, grid size and target count. Generator lays out the grid, shuffles, and derives `isTarget`. Fully computable, essentially unfailable.

**Example.** Target `▲` among `▼` and `◆`, 20 tiles, 7 targets, 12s window.
*Explanation: "Accuracy counts first. A wrong tap costs you more than a slow one."*

---

### `ATT_002` — Memory Flash

**One sentence:** Four symbols appear for two seconds — then tap the four you saw.

**Description.** A short exposure of 3–5 target symbols, a brief neutral interval, then a board of 9–12 symbols from which the player selects the ones they saw. Gated behind **Begin**.

**Why it is fun.** It is the only engine that tests *holding* rather than *finding*, and the sensation of an image decaying while you reach for it is unlike anything else in the pack. It also has an honest difficulty knob — exposure time — that needs no content redesign.

**Difficulty range** 2–5 · **Typical solve time** 15–25s total (2s exposure + 0.6s interval + selection)
**UI** Begin → exposure → neutral interval → selection grid, multi-select, explicit Submit. New component: `FlashSequence` (shared with `ATT_004`).
**Registry** `estimated_time: 22s` · `weekly_cap: 2` · `min_days_between: 3` · `rotation_weight: 1.0`

**Accessibility.** **The interval must be a neutral surface at the app's background luminance — never white, never a flash.** This is a §13 hard requirement and the single biggest implementation trap in this engine. Exposure time is a *difficulty* parameter, and its floor must be generous (≥1500ms) because reading speed and saccade latency vary widely. Selection targets ≥48dp. No time pressure during selection — the memory is the task, not the tapping.

**Validation.**
- Every target symbol appears exactly once on the selection board.
- Board contains ≥2× as many symbols as targets.
- All symbols shape-distinct (never colour), from the approved glyph list.
- `exposureMs` within the band for the declared difficulty.
- No target adjacency pattern on the board that hints at the set.

**Scoring.** **Partial credit.** Accuracy = `(correctSelections − falseSelections) / targetCount`, clamped. Speed bonus applies to *selection* time only, scaled by accuracy — the exposure and interval are excluded from the clock, since the player cannot act during them. **At difficulty 5, order matters**: the player must tap the symbols in the order shown, and accuracy counts correct positions. This is a difficulty variant, not a separate engine.

**AI generation.** Model emits target set, board set and exposure. Generator verifies containment and distinctness. Trivial to validate.

**Example.** Shown for 2000ms: `▲ ◆ ■ ●` → neutral interval → board of 9 symbols → tap the four.
*Explanation: "Four symbols, two seconds. Accuracy counts first."*

---

### `ATT_003` — Rapid Classification

**One sentence:** Sort each symbol into one of two groups, as many as you can before time runs out.

**Description.** Symbols appear one at a time in the centre. Two large buttons below (e.g. *curved* / *straight*, *pointing up* / *pointing down*). The player classifies each; the next appears immediately. Fixed multi-second window. Gated behind **Begin**.

**Why it is fun.** It has a rhythm the sweep does not — a steady beat of small decisions rather than one long scan. It is the closest the app gets to flow, and it is over before you tire of it.

**Difficulty range** 2–5 · **Typical solve time** 15–20s (window)
**UI** Begin → centred symbol + two large buttons + countdown + progress ("7 of 12"). New component: `ClassificationStream`.
**Registry** `estimated_time: 22s` · `weekly_cap: 2` · `min_days_between: 3` · `rotation_weight: 1.0`

**Accessibility.** Two buttons, each ≥64dp tall and full half-width — **left/right handedness neutral by symmetry**. Classification rule stated in the untimed brief, and restated as the button labels, so nothing must be memorised. No flashing between items: the symbol swaps, the surface does not blink. Rule must be shape-based.

**Validation.**
- The classification rule is total and unambiguous over the symbol alphabet — every symbol has exactly one correct bucket, verified against a curated glyph→attribute table.
- **No borderline symbol.** If a glyph's membership is arguable (is a diamond "curved"?), it is excluded from the alphabet. Human-curated table, not model assertion.
- Buckets are roughly balanced (40–60% split) so the player cannot win by tapping one side.
- Item count achievable within the window at a fair pace.

**Scoring.** **Partial credit.** Accuracy = `correct / attempted`, and coverage = `attempted / total`. Accuracy points = `14 × accuracy × coverage`. Unattempted items score nothing but are not penalised. Speed bonus scaled by accuracy. This structure makes guessing fast strictly worse than classifying carefully — which is the Core Spec's *accuracy-first* mandate, enforced arithmetically.

**AI generation.** Model picks a rule and an item sequence from the curated alphabet. Generator verifies bucket balance and rule totality. Fully computable.

**Example.** Rule: *does the symbol have a curved edge?* Stream: `● ▲ ◆ ○ ■ ● ▲ …` Buttons: **Curved** / **Straight**. 12 items, 18s.
*Explanation: "Accuracy first. Classifying eight carefully beats rushing twelve."*

---

### `ATT_004` — Change Detection · *deferred to v1.1*

**One sentence:** The grid disappears for a moment and returns with one cell changed — tap it.

**Description.** A grid is shown for ~3s, replaced by a neutral surface for ~600ms, then returns with exactly one cell's glyph altered. The player taps the changed cell.

**Why it is fun.** It exploits change blindness, which is a genuinely startling experience — the change is *enormous* once you see it and invisible until then. Players will tell people about this one.

**Difficulty range** 2–5 · **Typical solve time** 15–25s
**UI** Begin → grid → neutral interval → grid → tap. **Reuses `FlashSequence` from `ATT_002`.**
**Registry** `estimated_time: 22s` · `weekly_cap: 2` · `min_days_between: 3` · `rotation_weight: 0.9`

**Accessibility.** The interval must be a **neutral surface at background luminance, not a blank white screen** — a white flash between two dark grids is exactly the flashing content §13 forbids, and would be a genuine harm, not a nitpick. This constraint is what makes the engine buildable at all.

**Validation.** Identical to `OBS_002` — the two grids differ in exactly one cell, shape-based, non-corner.

**Scoring.** Single choice. Accuracy-first: 14 + speed, where speed is measured from the *return* of the grid, not from Begin.

**Why deferred.** Not because it is weak — it may be the most memorable engine in the catalog. It is deferred because it is `OBS_002` plus a memory interval, and until `ATT_002` proves the `FlashSequence` timing component on real devices (where a 600ms interval may render as 200ms or 900ms depending on the phone), building a second engine on that foundation is premature. **Build the component once, prove it, then get this engine nearly free.**

---

## 4. Catalog review — challenging the design

The suggested list contained 25 engines. Twenty survive. This section records what changed and why, because the *rejections* are the actual work of this phase.

### 4.1 The three-engines-that-were-one problem

**Number Sequence, Shape Sequence, and Symbol Progression are the same engine.** Identical interaction (a row of terms, pick the next), identical validator, identical scoring, identical component. The only difference is the alphabet the terms are drawn from — and an alphabet is *content*, not a mechanic.

Shipping them as three engines would have been a lie told to the rotation scheduler: it would believe Pattern had five engines and cheerfully serve the player a sequence-completion puzzle three days running, each time reporting a different engine name. Merged into `PAT_001`, with `tokenType ∈ {number, shape, symbol}` as a content field.

This is gate 8 doing its job, and it is the single most important merge in the catalog.

### 4.2 Mirror Match, absorbed

Mirror Match and Rotation Match present the same interaction (compare a target to four candidates) and the same skill (mental transformation). Worse, run side by side they teach the player a shortcut that ruins both.

The resolution is better than either: **a mirrored copy is the perfect distractor for a rotation puzzle.** It looks correct and is not. Mirror Match is therefore absorbed into `OBS_003` as its primary distractor type, which strengthens the surviving engine instead of diluting the catalog.

### 4.3 Missing Detail, absorbed

"Which figure is missing a stroke?" is Odd One Out where the difference type is *internal detail*. Same grid, same tap, same validator. It is already how the shipped `OBS_001` content works (`⊕` among `⊗`). Absorbed as a content parameter, `differenceType ∈ {orientation, detail, fill, count}`.

### 4.4 Visual Grouping, rebuilt

"Visual Grouping" was too vague to survive gate 7 — *group these somehow* is not a one-sentence instruction. Every concrete version I could write either collapsed into Odd One Out (*"tap the one that doesn't belong"*) or required a multi-select rule the player had to be taught.

Rebuilt as **Pair Find**: *exactly two tiles match; tap them both.* Concrete, one sentence, trivially validated, and the inverted search strategy makes it feel different. It survives — but as the weakest Observation engine, deferred to v1.1.

### 4.5 Word Relationships and Category Matching, absorbed

**Word Relationships** *is* Analogy — a relation between two words, transported. Absorbed into `LNG_001`, whose relation catalogue is exactly the list of word relationships worth testing.

**Category Matching** *is* Odd Word Out — membership of a closed category. Absorbed into `LNG_002`.

Two of the five suggested Language engines were duplicates of the other two. Language Logic is the category most prone to this, because "words with a relationship" describes almost anything you can do with words.

### 4.6 Sentence Completion, narrowed and renamed

As proposed, "Sentence Completion" fails gate 3 outright: fill-in-the-blank is a vocabulary test, and a vocabulary test is exactly what the Core Spec redesigned this category to eliminate.

Narrowed to `LNG_004` **Connective Logic**: the blank is always a logical connective drawn from a closed set of four. The word is never the puzzle; the logical relation is. Even so it is deferred, because the content discipline required to keep it logical rather than grammatical is unproven.

### 4.7 Outright rejections

| Engine | Verdict | Reason |
|---|---|---|
| **Mini Riddles** | ✕ Rejected | Fails gate 6 (validation) and gate 3 (language). Riddles depend on wordplay, lateral leaps and shared cultural reference. No deterministic program can prove a riddle has exactly one answer, and "the answer is clever" is not a validator. If a human must adjudicate every instance, it cannot be mass-generated. |
| **Constraint Solving** (Einstein-style grid) | ✕ Rejected for daily packs | Fails §2.4 outright: 2–5 minutes for one puzzle, in a 4-minute five-puzzle session. Excellent puzzle, wrong product surface. **Candidate for a future paid Practice Mode**, where the time budget does not exist — noted in §7 as an opportunity, not a loss. |
| **Symbol Tracking** (follow a moving symbol) | ✕ Rejected | Fails gate 2 (fair) and gate 4 (accessible). Requires sustained animation, so the score becomes a function of frame rate and touch sampling — the *exact* device-benchmark failure the Attention Speed redesign exists to prevent (Core Spec §3). It also cannot honour `prefers-reduced-motion` without destroying the puzzle. Rejecting this is not a close call. |
| **Priority Target** (rule changes mid-task) | ⊘ Absorbed | Genuinely interesting as *set-shifting*, but the interaction, the grid, the validator and the scoring are identical to Symbol Sweep. The player would read it as "the sweep, but the instructions changed." Absorbed into `ATT_001` as a **difficulty-5 variant** (`ruleSwitchAtMs`), where the switch scores as a harder sweep rather than a new engine. |
| **Hidden Object** (Core Spec §3 example) | ✕ Rejected for now | Requires illustrated art assets. That means either an art budget or AI image generation — and an AI-generated image cannot be deterministically validated ("is the object actually findable, and only once?"). Revisit only if an art pipeline exists. |
| **Symmetry Check** ("is this shape symmetrical?") | ✕ Rejected | Binary answer → 50% score from a coin flip. It would flatten the score distribution (Core Spec §7) and hand a casual guesser 10 free points. Any engine whose answer space is two options is disqualified on principle. |
| **Word Ladder** (Core Spec §3 example) | ✕ Rejected | Fails gate 3 and gate 6. Requires vocabulary depth, and proving a unique shortest ladder requires a dictionary the model does not have. |
| **Letter Pattern** (Core Spec §3 example) | ⊘ Recategorised | `ACE, BDF, CEG, ?` is not language reasoning at all — it is `PAT_001` with letters as tokens. It moves to Pattern as a `tokenType`, and Language Logic is better for its absence. |

### 4.8 Category health

Honest assessment. Not all five categories are equally strong, and pretending otherwise would guarantee that the weakest one degrades first.

| Category | Health | Assessment |
|---|---|---|
| **Observation** | 🟢 Strong | Four genuinely distinct visual acts: find the anomaly, compare two fields, rotate mentally, find the match. Cheap to generate, trivial to validate, zero language load. The most robust category. |
| **Logic** | 🟢 Strong *(now)* | Was the second-weakest — four text-heavy engines in a category that is not supposed to test reading. **Balance Scales fixes this**, and Ordering's build-interaction breaks the multiple-choice monotony. |
| **Attention Speed** | 🟡 Adequate | Structurally constrained: every good idea either collapses into "sweep" or drifts into reaction-time. Four engines is probably its natural ceiling, and that is acceptable — this category's job is a 15-second jolt, not depth. The `FlashSequence` component unlocks two of the four. |
| **Language Logic** | 🟡 Adequate | Suffers from a permanent, *accepted* fairness cost (English-first, Core Spec §2.1). Its engines are sound, but two of five suggestions were duplicates and one was a vocabulary test in disguise — evidence that this category attracts weak ideas. It needs the strictest content review. |
| **Pattern** | 🔴 **Weakest** | Everything wants to be a sequence. Three of five suggested engines were the same engine. It survives on `PAT_002` Matrix Completion — genuinely excellent — and `PAT_003` Sequence Repair. `PAT_004` Rule Detection is its only real growth path, and it has the hardest validator in the catalog. **If any category runs out of content variety first, it will be Pattern.** |

**The uncomfortable conclusion:** Pattern is carried by one engine (Matrix Completion) whose attribute space is finite. It deserves a dedicated design pass before v1.2, not more content.

---

## 5. Version 1 recommendation

**Ship 15 of 20 engines: the first three of each category.**

This is not an arbitrary cut. It is the smallest set the rotation scheduler can actually schedule.

### 5.1 The rotation floor (why not fewer)

Core Spec §5 requires: *never repeat the same engine in the same category on consecutive days*, and *no more than twice per week per engine (configurable)*, and *every engine appears within a rolling 14-day window*.

Exhaustively searching every 7-day schedule for one category:

| Engines per category | Weekly cap 2 | Weekly cap 3 |
|---|---|---|
| 2 | ✕ **infeasible** | ✕ **infeasible** |
| 3 | ✕ **infeasible** | ✓ feasible (`A B A B A B C`) |
| 4 | ✓ feasible (`A B A B C D C`) | ✓ feasible |

So:

- **Two engines per category can never fill a week.** Shipping a category with two engines guarantees the scheduler reports infeasibility on day one.
- **Three engines per category is the hard floor**, and only if the weekly cap is relaxed from 2 to 3. The Core Spec explicitly marks that cap "(configurable)", so this is a permitted setting, not a violation — but it must be a *conscious, temporary* one, recorded here.
- **Four engines per category** is what restores the intended cap of 2, and produces a visibly better spread.

**V1 therefore ships 3 engines per category with `weekly_cap: 3`, and v1.1 adds the fourth to tighten it back to 2.** That is the entire logic of the roadmap in §6.

### 5.2 The fifteen

| Category | Ship | Why these three |
|---|---|---|
| Observation | `OBS_001` Odd One Out ✅ · `OBS_002` Spot the Difference · `OBS_003` Rotation Match | Three distinct visual acts. Two are already proven; Rotation Match has the safest generator in the catalog (the model emits a matrix, everything else is computed). |
| Pattern | `PAT_001` Sequence Completion ✅ · `PAT_002` Matrix Completion · `PAT_003` Sequence Repair | Extrapolate, intersect, verify. Matrix Completion is the category's anchor and the best hard puzzle we have. Rule Detection is held back on validator risk. |
| Logic | `LOG_001` Deduction ✅ · `LOG_002` Balance Scales · `LOG_003` Ordering | Balance Scales ships in V1 **specifically because it is language-free** and repairs a real fairness gap. Ordering brings a second interaction model. Truth Statements is held back on time budget. |
| Language Logic | `LNG_001` Analogy ✅ · `LNG_002` Odd Word Out · `LNG_003` Sentence Ordering | Relation, category, structure — three different ways to reason through English without testing vocabulary. Connective Logic is held back on drift risk. |
| Attention Speed | `ATT_001` Symbol Sweep ✅ · `ATT_002` Memory Flash · `ATT_003` Rapid Classification | Scan, hold, decide. Three different sensations inside a 20-second envelope. Change Detection is held back until `FlashSequence` is proven on real hardware. |

**Five engines are already built.** V1 requires building **ten**, of which four (`OBS_002`, `PAT_003`, `LNG_003`, `ATT_002`) reuse or lightly extend existing components.

### 5.3 What V1 deliberately does not ship

`OBS_004` Pair Find · `PAT_004` Rule Detection · `LOG_004` Truth Statements · `LNG_004` Connective Logic · `ATT_004` Change Detection.

Each is deferred for a *stated, specific* reason recorded in its section — never "we ran out of time". Four of the five are excellent engines waiting on a dependency (empirical data, a proven component, a mature review pipeline, or a validator). None is a bad idea being quietly buried.

---

## 6. Roadmap

| Release | Engines | Rotation setting | Gate to pass before shipping |
|---|---|---|---|
| **v1.0** — Launch | 15 (3 per category) | `weekly_cap: 3`, `min_days_between: 2` | Ten new engines built, each with a passing automatic validator and ≥30 approved puzzles. |
| **v1.1** — Depth *(≈2 months in)* | +4 → 19 <br>`OBS_004` Pair Find · `LNG_004` Connective Logic · `ATT_004` Change Detection · *(4th Pattern engine TBD)* | **`weekly_cap: 2`** — the intended setting, now reachable | Empirical difficulty data from v1.0 (correct-answer rate, solve time, abandon rate) proving the shipped engines behave as authored. `ATT_004` gated on `FlashSequence` proving stable interval timing on low-end Android. |
| **v1.2** — Ambition *(≈4–6 months)* | +2 → 21 <br>`PAT_004` Rule Detection · `LOG_004` Truth Statements (capped at 3 speakers) | unchanged | `PAT_004`: an enumerable rule space and a working ambiguity checker. `LOG_004`: measured solve time under 60s at difficulty ≤4, or it stays out. |
| **v1.3** — Pruning | Possibly **−1** | unchanged | Retire the weakest engine by empirical data (lowest completion rate, highest report rate, or "feels the same as X" in feedback). **A catalog that only grows is a catalog nobody curates.** |
| **v2.0** — New surfaces | Practice Mode engines | n/a | `Constraint Solving` and other >60s engines ship here, where the four-minute session budget does not apply. This is the natural home for the puzzles rejected on time alone. |

**Sequencing principle:** never add an engine to fix boredom. Add an engine when the *scheduler* is constrained or the *data* shows a gap. Content variety is cheaper than engine variety, and a new engine costs a component, a validator, a prompt template and an accessibility audit — forever.

---

## 7. Implementation risks

1. **Glyph rendering across platforms.** Six of twenty engines depend on Unicode geometric glyphs (`◐ ◑ ◤ ◥ ⊕ ⊗ ◣ ◢`) rendered by the system font. These already differ between Windows, iOS and Android. A pair that mirrors cleanly in one font may not in another, which does not merely look wrong — it **destroys the puzzle**. *Mitigation:* the approved glyph-pair list must be verified on real iOS and Android hardware before any pair enters generation. Longer term, `OBS_003`'s approach — rendering shapes from boolean matrices as Views — is font-independent and should be extended to other engines.

2. **`PAT_003` Sequence Repair's uniqueness validator.** Proving *no other single-term repair yields a valid sequence* requires searching the repair space against every approved rule family at every position. Get this wrong and the puzzle has two right answers, the player is told they are wrong, and the incident policy (§10) fires. This validator must be written before the engine, and tested adversarially.

3. **`LNG_002` Odd Word Out depends on a curated ontology, not on AI.** A model will confidently assert category membership that is wrong or arguable. The leave-one-out ambiguity check is only as good as the ontology behind it. This caps generation volume for the engine, permanently. Accept it.

4. **`LNG_003` Sentence Ordering can pass its validator and still be arguable.** English tolerates reordering. This is the one engine where automatic validation is necessary but not sufficient, and human review is mandatory. If review capacity becomes the bottleneck, this engine's cadence should drop before its quality does.

5. **Flash-interval timing on low-end Android.** `ATT_002` and `ATT_004` depend on a 600ms neutral interval being *approximately* 600ms. On a throttled device it may not be. Since exposure time is the difficulty knob, an unreliable interval makes difficulty unreliable — and Attention Speed is the category where the Core Spec already warns about device-dependent measurement. Measure before shipping `ATT_002`; do not build `ATT_004` until it holds.

6. **Two new interaction models to build and get right.** `OrderingInput` (tap-to-order, reversible, screen-reader-legible) and `FlashSequence` (timed exposure, neutral interval). Each serves two engines, so each is worth building properly — but each is also a new accessibility surface. **Never use drag.**

7. **Engine count inflates the review burden.** Fifteen engines × ~10 puzzles each per month is 150 candidates to review monthly, against the Core Spec's stated 155. The batch review already risks fatigue (§4). More engines means more *context switching* during review, which is a distinct and worse kind of fatigue than volume. *Mitigation:* review one engine at a time, not one day at a time.

---

## 8. Opportunities discovered while designing this

1. **Balance Scales repairs a fairness gap nobody had named.** Logic was, quietly, a *reading* category. Every engine was prose. For a non-native English speaker, Logic and Language Logic were both English tests — meaning two of five categories carried the same accepted-but-real disadvantage, not one. A language-free Logic engine halves that. This was the most valuable thing this design phase produced, and it came from asking gate 3 of an engine that had already "passed".

2. **One component, two categories.** `OrderingInput` serves `LOG_003` and `LNG_003`. `FlashSequence` serves `ATT_002` and `ATT_004`. Building a *component* is expensive; building the second engine on it is nearly free. **This should drive build order**: implement the component-sharing engines adjacently, not by category.

3. **The rotation floor is a product constraint, not an engineering one** — and it was invisible until it was computed. "How many engines do we need?" has an exact answer (three per category minimum, four to hit the intended weekly cap), and it should be recomputed whenever the cap or pack size changes. It belongs in the scheduler's feasibility report.

4. **The rejected long-form puzzles are a Practice Mode, not waste.** `Constraint Solving`, `LOG_004` at full difficulty, and multi-step variants all fail on one axis only: the four-minute session. Core Spec §15 already lists Practice Mode as a premium feature. It now has a *reason to exist* beyond "more puzzles" — it is the home for a genuinely different, slower kind of thinking. That is a much better premium pitch.

5. **Difficulty knobs that need no new content.** Exposure time (`ATT_002`), rule-switch timing (`ATT_001` at difficulty 5), grid size, and distractor similarity all scale difficulty without authoring anything. Engines with a continuous difficulty knob are worth more than engines without one, and this should become an explicit criterion — a **ninth gate** — for future engines.

6. **Distractor design is where puzzle quality actually lives.** Across every category, the engines that survived have *typed, structural* distractors — the mirror image, the near-miss matrix, the named fallacy, the effect-instead-of-the-shortage. Random distractors make every puzzle easy and every engine feel cheap. The generation prompt templates should specify distractor *types*, never ask for "three wrong answers".

---

## 9. Registry summary

Values ready to seed `puzzle_engines` (Core Spec §3, §14).

| engine_id | name | category | min_diff | max_diff | est_time | weekly_cap | min_days_between | rotation_weight | ui_component | active in v1 |
|---|---|---|---|---|---|---|---|---|---|---|
| `OBS_001` | Odd One Out | Observation | 1 | 4 | 15s | 3 | 2 | 1.0 | `ObservationEngine` | ✅ |
| `OBS_002` | Spot the Difference | Observation | 1 | 4 | 25s | 3 | 2 | 1.0 | `TwoGridCompare` | ✅ |
| `OBS_003` | Rotation Match | Observation | 2 | 5 | 32s | 2 | 3 | 0.9 | `RotationMatchEngine` + `ShapeMatrix` | ✅ built |
| `OBS_004` | Pair Find | Observation | 2 | 4 | 30s | 2 | 3 | 0.8 | `PairFindEngine` + `Grid` | ✅ built (pulled forward) |
| `PAT_001` | Sequence Completion | Pattern | 1 | 5 | 25s | 3 | 2 | 1.2 | `PatternEngine` | ✅ |
| `PAT_002` | Matrix Completion | Pattern | 2 | 5 | 45s | 2 | 3 | 1.0 | `MatrixCompletionEngine` + `Figure` | ✅ built |
| `PAT_003` | Sequence Repair | Pattern | 2 | 5 | 32s | 2 | 3 | 1.0 | `SequenceRepairEngine` + `SequenceChips` | ✅ built |
| `PAT_004` | Rule Detection | Pattern | 3 | 5 | 55s | 1 | 5 | 0.6 | `ShapeGrid` | — |
| `LOG_001` | Deduction | Logic | 2 | 5 | 38s | 3 | 2 | 1.1 | `LogicEngine` | ✅ |
| `LOG_002` | Balance Scales | Logic | 2 | 5 | 38s | 3 | 2 | 1.1 | `BalanceScalesEngine` + `BalanceScale` | ✅ built |
| `LOG_003` | Ordering | Logic | 2 | 5 | 45s | 2 | 3 | 0.9 | `OrderingEngine` + `OrderingInput` | ✅ built |
| `LOG_004` | Truth Statements | Logic | 3 | 5 | 65s | 1 | 5 | 0.5 | `LogicEngine` | — |
| `LNG_001` | Analogy | Language Logic | 2 | 5 | 25s | 3 | 2 | 1.1 | `LanguageLogicEngine` | ✅ |
| `LNG_002` | Odd Word Out | Language Logic | 1 | 4 | 20s | 3 | 2 | 1.0 | `OddWordOutEngine` + `MultipleChoice` | ✅ built |
| `LNG_003` | Sentence Ordering | Language Logic | 2 | 4 | 35s | 2 | 3 | 0.9 | `SentenceOrderingEngine` + `OrderingInput` | ✅ built |
| `LNG_004` | Connective Logic | Language Logic | 2 | 4 | 25s | 2 | 3 | 0.8 | `MultipleChoice` | — |
| `ATT_001` | Symbol Sweep | Attention Speed | 1 | 5 | 20s | 3 | 2 | 1.2 | `AttentionSpeedEngine` | ✅ |
| `ATT_002` | Memory Flash | Attention Speed | 2 | 5 | 22s | 2 | 3 | 1.0 | `MemoryFlashEngine` + `useFlashSequence` | ✅ built |
| `ATT_003` | Rapid Classification | Attention Speed | 2 | 5 | 22s | 2 | 3 | 1.0 | `RapidClassificationEngine` + `TaskBrief` | ✅ built |
| `ATT_004` | Change Detection | Attention Speed | 2 | 5 | 22s | 2 | 3 | 0.9 | `FlashSequence` | — |

*Every engine also carries `prompt_template`, `validator`, `explanation_template` and `accessibility_profile` ids, assigned when the engine is built.*

---

**Nothing in this catalog is content. Approve the engines first; generate the puzzles second.**
