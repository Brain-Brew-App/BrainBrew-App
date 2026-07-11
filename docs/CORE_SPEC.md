# BrainBrew — Core Spec (Tier 1)

This document contains every decision that is painful to change later. It is the constitution of the app, not a feature backlog. Anything not in here (UI polish, animation feel, exact copy, the full engine catalog beyond the examples given) is expected to evolve during building and should not be treated as locked.

If a future decision contradicts something in this document, that's a signal to slow down and either update this document deliberately, or realize the new idea is wrong.

---

## 1. Product Vision

**Name:** BrainBrew
**Tagline:** "Five minutes. Sharper every morning."

**What it is:** A daily five-puzzle mental warm-up. Every user in the world receives the identical pack for a given date — one Observation, one Pattern, one Logic, one Language Logic, one Attention Speed challenge. Completing it produces one BrewScore (0–100), which is compared globally, by country, and against friends.

**What it explicitly is not:**
- Not a "brain training" / cognitive-improvement product. Lumos Labs paid a $2M FTC settlement in 2016 for claiming brain games improve real-world cognitive performance, and current (2025) meta-analyses still find no convincing evidence of transfer effects from brain-training games to general cognition. BrainBrew never claims to make anyone smarter. It sells a daily ritual, competition, and a moment of focus — not a cognitive outcome.
- Not trying to be the next big hit. This is a solo-founder project meant to be simple, sustainable, hopefully profitable in a modest way, and genuinely fun. Scope decisions should be judged against that goal, not against venture-scale ambition.
- Not competing on "polish" alone. Puzzmo (Hearst-owned) already occupies a very similar shape — daily puzzle portfolio, leaderboards, social features — with newspaper-scale distribution behind it. Differentiation has to come from a specific wedge (friends-first competition as the primary loop, not a bolted-on stat), not from being marginally prettier.

**Reference feel:** Wordle's daily ritual + Duolingo's polish + chess.com's competitiveness + Apple Fitness's progress framing.

**Session flow:** Open app → play 5 challenges (~4 min) → get BrewScore → compare → share → leave. No ads, no distractions once a session starts.

**Challenge order (fixed rhythm):** Observation → Pattern → Logic → Language Logic → Attention Speed. Visual → analytical → logical → verbal → fast. This rhythm — the feeling of moving through five different kinds of thinking — is the actual product, not any single puzzle type. This is why the Phase 0 prototype builds all five engines at once rather than perfecting one first: the hypothesis being tested is the whole session, not one puzzle.

---

## 2. Core Principles (non-negotiable)

1. **English-first.** The app, the puzzles, and the leaderboards are all English at launch. This is an accepted trade-off, not an oversight — it means non-native speakers are at some disadvantage on Language Logic specifically, but "reasoning via language" (synonyms, antonyms, analogies, odd-word-out, sentence ordering) was chosen specifically to minimize this relative to a vocabulary-trivia design, which would have made it worse.
2. **Everyone gets the identical daily pack.** This is the foundation of fairness, shareability, discussion, and leaderboard meaning. A published pack is immutable — no per-user variation, no hot-swapping content after publication, no per-timezone pack variants.
3. **Server-authoritative.** The client displays puzzles and collects input. The server owns timing, scoring, validation, and rankings. Never trust a client-reported timer, client-calculated score, or client-side answer check.
4. **Finite puzzle engines; AI fills content, not mechanics.** A small, human-designed set of ~15–20 puzzle engines (fixed rules, fixed UI, fixed scoring, fixed validation) is built once. AI's only job is populating those engines with fresh content — new numbers, shapes, word sets, images, logic scenarios. AI is never asked to invent a new kind of puzzle.
5. **AI is creative. The platform is deterministic.** Generation (the LLM step) is inherently non-deterministic — this is expected and fine, not a bug. The determinism boundary is the human-approval gate: everything from a stored, approved puzzle onward (scoring, scheduling from the approved pool, validating stored content, computing leaderboards) is fully deterministic and reproducible. This matters concretely: if a player disputes a score, it must be possible to reconstruct exactly what they saw and exactly why it scored the way it did.
6. **Batch content operations.** Generate, review, and schedule a full month of packs at once (roughly one weekend/month), not daily. Content review is split across multiple sessions to avoid fatigue-driven rubber-stamping.
7. **Lean operations.** No bespoke admin dashboard UI until real usage forces the need. Use Supabase's own table editor for review/approve/publish in the meantime.
8. **Competitive integrity over precision.** Ranked play requires an account. Attempts are server-verified. Where a choice exists between a more precise but noisier measurement (e.g. raw reaction milliseconds) and a fair but coarser one, choose fairness.
9. **The core daily ritual is never paywalled.** Free tier always includes today's pack, basic leaderboard, streak, and share card. Monetization is additive (archives, practice mode, stats, tournaments), never a gate on the thing that makes the app worth opening.

---

## 3. The Five Categories and Engine Layer

### Category → Engine → Content (three levels of variety)

- **Level 1 — Category** (fixed forever): Observation, Pattern, Logic, Language Logic, Attention Speed.
- **Level 2 — Engine** (fixed mechanics, small human-curated set per category, e.g. Observation: Odd One Out, Spot the Difference, Hidden Object, Image Memory, Visual Rotation). The full engine catalog across all five categories is now specified in [`ENGINE_CATALOG.md`](ENGINE_CATALOG.md) (Tier 2, Phase 0.8) — twenty engines, of which fifteen are recommended for Version 1. That document is subordinate to this one: where they disagree, this document wins.
- **Level 3 — Content** (AI-generated within a fixed engine: new numbers, shapes, layouts, images, word sets).

### Category redesigns worth remembering (the "why," not just the "what")

- **"Word Challenge" → "Language Logic."** Original word-trivia framing conflated two different fairness problems: native-speaker advantage (acceptable, accepted trade-off of English-first) and word-skill-vs-reasoning-skill (not acceptable — a vocabulary quiz doesn't measure the same thing as the other four categories). Redesigned around synonym/antonym/analogy/sentence-ordering/odd-word-out/category-matching/letter-pattern/word-ladder — reasoning expressed through language, not obscure vocabulary recall.
- **"Reaction Challenge" → "Attention Speed."** Raw millisecond reflex timing is a device/network benchmark in disguise — screen refresh rate, touch sampling rate, OS scheduling, and network latency all pollute the measurement more than actual human reflex variance does. Redesigned around multi-second rapid-perception tasks (tap every green circle ignoring blue; recreate a 4-symbol flash; classify shapes before they disappear) where latency noise becomes a negligible fraction of a several-second task instead of most of the signal. Scoring is accuracy-first, completion-time second — and this category must never dominate overall BrewScore.

### Puzzle Engine Registry

Lives as a Supabase table (`puzzle_engines`), not a code file — every balancing decision (rotation weight, difficulty range, weekly cap) becomes a data edit, not a deployment.

Fields per engine:

| Field | Purpose |
|---|---|
| `engine_id` | Unique identifier (e.g. `OBS_001`) |
| `category` | Observation / Pattern / Logic / Language Logic / Attention Speed |
| `name` | e.g. "Odd One Out" |
| `active` | Whether this engine is currently in rotation |
| `min_difficulty` / `max_difficulty` | Allowed difficulty range |
| `rotation_weight` | Scheduler preference weight |
| `weekly_cap` | Max appearances per week |
| `min_days_between` | Minimum gap between appearances |
| `estimated_time` | Expected solve time |
| `ui_component` | Which client component renders this engine |
| `prompt_template` | AI generation prompt template ID |
| `validator` | Validation rule set ID |
| `explanation_template` | Post-answer explanation template |
| `accessibility_profile` | See Section 7 |

The registry is metadata/routing, not UI generation — each engine's actual interaction/UI component still has to be hand-built once, the registry just describes it and tells the app and scheduler how to use it.

---

## 4. Content Pipeline

### 5-stage pipeline

1. **Generate.** AI produces a batch of candidate puzzles per engine (e.g. 200–250 candidates/month), using that engine's prompt template. Constraints given to the model: exactly one correct answer, unique options, include an explanation, avoid cultural references (given English-first + global audience), solvable within the engine's estimated time.
2. **Validate automatically.** Exactly one correct answer; all options unique; explanation is logical; answer isn't obvious from formatting; text length acceptable; difficulty within target band; no offensive/cultural/political content; not a near-duplicate of a recent puzzle (see repetition detection).
3. **Human review.** Reviewer approves the puzzles that will fill each day's slots, can edit wording. Confidence score (Section 6) assists but doesn't replace judgment.
4. **Test run.** An internal test account plays the full assembled pack: does it load, is scoring correct, is anything confusing, is the answer actually correct, is timing fair, does it feel fun.
5. **Publish.** Approved pack is scheduled and goes live automatically at **00:00 UTC** — a single global reset chosen deliberately over per-timezone resets, trading "morning" authenticity in non-UTC-morning timezones for leaderboard fairness and implementation simplicity.

### Cadence

Batch, not daily. Roughly one weekend per month: generate ~200–250 candidates, review and approve 155 (31 days × 5 puzzles), schedule the entire month, then no content work for four weeks. This is a deliberate hedge against founder time/energy constraints, not an accident.

Review fatigue is real — split across sessions rather than one marathon sitting (e.g. two categories per session across a weekend, with breaks). Judgment degrades by candidate #150 in a single sitting; that's exactly how a bad puzzle slips through a good pipeline.

**Content Reserve:** each monthly cycle also produces ~20–30 extra approved puzzles spread across categories. These exist only to fill gaps or replace rejected candidates *before* a month is published — never to be hot-swapped into an already-live day (that would break the "everyone plays the same pack" guarantee).

### Repetition detection (3 layers)

1. **Exact duplicate** — simple hash comparison.
2. **Template matching** — every puzzle stores Puzzle Type, Rule Type, Difficulty, Mechanic, Visual Style; cap identical template combinations within a rolling window.
3. **Embedding similarity** — every candidate gets an embedding, compared against the last 90 days; flag if semantic similarity exceeds threshold. Catches "same puzzle, different wording."

Engine-level rotation (which engine appears when) is a *separate* concern from content-level repetition (Section 5) — a user can notice "I just did a Sequence Completion two days ago" even if the actual numbers were different every time.

---

## 5. Engine Rotation Scheduler

Deterministic. Runs once, at monthly batch-assembly time.

**Hard constraints (never violated — generation fails if unmet, no compromise):**
- One valid answer
- Engine compatible with its category
- Difficulty inside the allowed range
- Approved content only
- No duplicate puzzle
- Engine supports the current app version
- Accessibility requirements satisfied

**Soft constraints (relaxed in priority order when no perfect solution exists):**
1. Confidence score preference
2. Engine rotation weight
3. Weekly frequency target
4. Difficulty distribution
5. Seasonal preference

**On infeasibility:** the scheduler must report exactly which constraint broke and why — never a silent "best effort." Example: *"Unable to satisfy: Observation — Odd One Out exceeded weekly cap. Reason: only two approved Observation engines available. Suggested action: approve more Observation content."*

**Rotation rules:** never repeat the same engine in the same category on consecutive days; target no more than twice per week per engine (configurable); each engine appears at least once within a rolling 14-day window; seasonal overrides (e.g. a themed variant) are allowed without breaking rotation too heavily, but exact seasonal-vs-rotation interaction is still an open design question, not yet resolved.

---

## 6. Puzzle Confidence Score

Composite signal per candidate, shown as a **component breakdown** during review (not one opaque number), so it assists human judgment rather than replacing it:

| Signal | Notes |
|---|---|
| Rule Validation | Result of automatic Stage 2 checks |
| AI Self-Review | Model's own confidence in the candidate |
| Similarity Check | Inverse of repetition-detection similarity score |
| Reviewer Confidence | Human reviewer's rating |
| Historical Engine Reliability | How well this engine's past content has performed |
| Prompt Reliability | How well this specific prompt template has performed historically |

**Cold-start handling:** in month one, the two historical signals don't exist yet — they're `N/A`, not zero. The composite score is computed from whichever signals are available (rule validation, AI self-review, similarity, reviewer confidence) and should not be artificially depressed by missing historical data. The model naturally becomes more informative as data accumulates.

The scheduler prefers higher-confidence candidates when assembling a month, subject to the hard/soft constraints above.

---

## 7. Difficulty Design

**Target pack composition:** 1 easy, 2 medium, 1 hard, 1 speed-based (Attention Speed).

**Target score distribution (why it matters):** casual user 45–65, good user 70–85, excellent user 85–95, rare perfect 96–100. If too many people hit 100, the leaderboard becomes boring and meaningless. If most people score ~30, they quit. This distribution is a design target, not a guarantee from static content authoring alone — see the feedback loop below.

**Empirical difficulty feedback loop:** for every puzzle, track correct-answer rate, average completion time, skip/abandon rate, report rate, and average score contribution. Compute an empirical difficulty score from real player behavior — e.g. a puzzle authored as "medium" that ends up with a 22% success rate actually behaved like "hard." Feed this back into future generation-prompt calibration automatically, rather than relying on static difficulty labels being correct by assumption.

---

## 8. Scoring

**BrewScore: 0–100.** Five challenges × 20 points max each.

Per-challenge score = Accuracy Points + Speed Bonus (e.g. 14 accuracy + up to 6 speed = 20 max). If the answer is wrong: 0–4 points max depending on game type, no speed bonus.

**Attention Speed scoring specifically:** accuracy first, completion time second — never raw millisecond reflex timing as the primary signal (see Section 3 for why). This category must never dominate the overall BrewScore; it contributes a deliberately bounded share of the total.

---

## 9. Server-Authoritative Architecture & Anti-Cheat

**Flow:**
```
Start puzzle
  → Server sends puzzle
  → Client solves
  → Client sends answer
  → Server validates
  → Server calculates score
  → Server stores attempt
  → Server returns score
```

**Client responsibility:** display the puzzle, collect input, send input. Nothing else.
**Server responsibility:** everything else — timing, scoring, validation, storage, ranking.

**Rules:**
- Never trust a client-reported timer, client-calculated score, or client-side answer check.
- The correct answer is never sent to the client before submission.
- Every puzzle is issued with a signed attempt token (Attempt ID, User ID, Puzzle ID, server-set "opened" timestamp, cryptographic signature). Every submission must include it — blocks fabricated submissions and replay attacks.

**Known, deliberately deferred residual gap:** pure server-clock timing for a sub-second signal would include network round-trip time as noise. This was a real concern for the original millisecond-based Reaction Challenge design; the Attention Speed redesign (Section 3) mostly resolves it by spreading tasks over several seconds, diluting RTT noise to a small fraction of the signal instead of most of it. No additional RTT-calibration mechanism was built at MVP stage — this is a conscious deferral, not an oversight, and should be revisited only if Attention Speed scoring turns out to still be network-sensitive in practice.

**Heuristic anti-cheat layer (on top of the server-authoritative core):** track time per puzzle, app backgrounding, multiple attempts, same-device multiple accounts, implausible Attention Speed times, repeated perfect scores. A given daily pack counts once per account toward leaderboard/streak; replay is allowed for practice but never affects ranking.

**Explicitly not worth engineering against at this scale:** self-reported country at onboarding (a low-stakes vanity-metric imperfection, not a real integrity threat worth the engineering time at MVP).

---

## 10. Incident Policy — Broken Live Puzzle

A documented policy, decided in advance rather than improvised under pressure — because with AI-generated content reviewed by one person once a month, an edge case will eventually get through.

**Severity levels:**

| Level | Definition | Action |
|---|---|---|
| 1 — Cosmetic | Typos, awkward wording, minor visual issues | Leave it. Fix in future content. |
| 2 — Imperfect but solvable | Unique intended answer still holds, wording isn't ideal | Leave it. Accept the day as-is. |
| 3 — Invalid | Two correct answers, no correct answer, unsolvable, wrong image mapping, scoring bug | Void the puzzle. |

**Level 3 procedure:**
1. Mark the puzzle void; remove it from scoring.
2. Recalculate everyone's BrewScore on a 0–80 scale, normalized back to 100 (proportional rescale — this preserves relative rank order, so it doesn't introduce a new fairness problem).
3. Rankings update automatically.
4. Show a transparent in-app notice explaining the correction.

**Explicitly rejected approach:** hot-swapping a replacement puzzle into an already-published day. This creates a two-tier pack (some users saw one 5th puzzle, others saw a different one) and directly violates "everyone plays the same pack." The published pack is immutable; incidents are handled by voiding and rescaling, never by substitution.

**Interaction with share cards:** a Level 3 void event can change a user's BrewScore *after* they've already shared a card showing the old score. Resolved in Section 11 — the shared card is a frozen historical snapshot and is never retroactively altered.

---

## 11. Share Cards

Shown after completing a session. Example shape:

```
BrainBrew — July 9
BrewScore: 82/100
🧠 Logic: ✅
🔢 Pattern: ✅
👁 Observation: ✅
🔤 Language Logic: ❌
⚡ Attention Speed: ✅

Top 9% globally
Streak: 12 days

Five minutes. Sharper every morning.
```

**Rules:**
- Never reveal answers.
- **Shared cards are immutable historical snapshots, timestamped at share time** (e.g. "Shared at 08:12 UTC") — not a live-updating representation of the user's score.
- If a later incident (Section 10) changes the underlying BrewScore, the already-shared image is not retroactively changed. Inside the app, the current score is shown with a note: *"Updated after puzzle validation."* Transparency beats perfection — the app tells the truth about what changed, rather than trying to make every historical artifact perfectly consistent.

---

## 12. Leaderboards & Guest Mode

**Leaderboards:** Global, Country, Friends — English-only at launch, consistent with the English-first principle (Language Logic performance factors into Country rank, which is an accepted trade-off of that decision).

Display uses **percentile framing**, not raw rank alone — e.g. "You scored 78. Top 12% globally. #382 in UAE. You beat 4 friends." Raw global rank alone feels discouraging at scale; percentile framing is more motivating and just as honest.

**Guest mode:** can play today's pack and experience the app fully. **No streak, no leaderboard placement, no ranked BrewScore.** On creating an account: *"Your first ranked day starts tomorrow."* Clean boundary, no abuse vector from disposable guest sessions gaming rankings.

---

## 13. Accessibility

Declared per-engine as part of the Engine Registry (Section 3), not handled as a global afterthought:

- Color-safe
- High-contrast compatible
- Screen-scaling tested
- Left/right-handed neutral
- No audio dependency
- No flashing content
- Minimum tap target 48dp

Any color-dependent Attention Speed or Observation task must be checked against this profile before approval — this matters most while there are only a handful of engines, since it's far easier to get right now than to retrofit after ten engines are shipped and some turn out to rely on a problematic color pair.

---

## 14. Data Model (core tables)

`users`, `profiles`, `daily_packs`, `puzzles`, `daily_pack_puzzles`, `attempts`, `attempt_answers`, `leaderboards`, `friendships`, `countries`, `subscriptions`, `admin_reviews`, `puzzle_reports`, `puzzle_engines` (the registry — Section 3).

Key fields:

```
daily_packs
- id, date, status (draft/testing/approved/live/archived), difficulty
- published_at, created_by_ai_model, reviewed_by, approved_at
```

```
puzzles
- id, type, prompt, options, correct_answer, explanation
- difficulty, metadata, quality_score, status
```

```
attempts
- id, user_id, daily_pack_id, score, completed_at
- total_time_ms, country, is_ranked, cheat_flag
```

```
puzzle_engines
- engine_id, category, name, active
- min_difficulty, max_difficulty, rotation_weight
- weekly_cap, min_days_between, estimated_time
- ui_component, prompt_template, validator
- explanation_template, accessibility_profile
```

**API contracts are not yet defined.** The server-authoritative flow (Section 9) describes the required interaction shape, but exact endpoint/payload design is next-phase work, not locked by this document.

---

## 15. Monetization

**Launch free.** Premium tier introduced later, never gating the core loop.

**Free (forever):** today's daily pack, basic leaderboard, streak, share card.
**Premium (later):** archives, practice mode, detailed stats, friend groups, custom tournaments, extra daily pack, themes, no ads (if ads are ever introduced at all).

No tournaments at MVP launch — deferred deliberately, since live tournaments raise the anti-cheat and infrastructure bar (real stakes attract real cheating effort) in a way not yet justified before the core loop is proven.

---

## 16. Admin Tooling

No bespoke admin dashboard UI at MVP or early stage — deferred until real usage forces the need. Until then:

```
AI generation script
  → Validation script
  → Supabase tables
  → Supabase's own Web UI (table editor)
  → Approve
  → Publish (scheduled function)
```

Zero frontend work for admin tooling. Build a real, polished editor only once the product is growing enough to justify the investment.

---

## 17. Tech Stack

- **Frontend:** React Native + Expo (**SDK 57** — this scaffold's `AGENTS.md` explicitly warns that Expo has changed significantly; check current versioned docs at the SDK's docs site before writing Expo-specific code rather than relying on possibly-stale training knowledge)
- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions)
- **AI generation:** Claude / OpenAI API, used only in the content pipeline (Section 4), never at runtime during a user session
- **Hosting/builds:** Expo / EAS
- **Analytics:** PostHog (or Amplitude)
- **Crash/error reporting:** Sentry
- **Subscriptions/payments:** RevenueCat
- **Repo:** private GitHub repo, `Brain-Brew-App/BrainBrew-App`

---

## 18. Build Order

**Phase 0 (current):** Prototype. Home screen, all five puzzle engines in their simplest hardcoded form, static local daily pack, results screen, basic score. Everything local — no backend, no AI, no database, no accounts, no leaderboard, no analytics. The only question this phase answers: **is this actually fun?**

**After Phase 0 proves the loop is fun, replace pieces one at a time — never build infrastructure ahead of proof:**
1. Hardcoded puzzles → Engine Registry
2. Local JSON → Supabase
3. Manual content → AI generation
4. Local scores → server scoring
5. Local app → global competition (real leaderboards, accounts, friends)

**Screens (11, deliberately capped):** Splash, Onboarding, Login, Home, Daily Challenge Intro, Puzzle Screen, Result Screen, Leaderboard, Profile, Settings, Admin (deferred per Section 16).

**Explicitly not building yet:** chat, feed, complex avatars, in-app store, elaborate achievement systems, 20 game modes, deep personalization.

---

## 19. Visual Direction

**Feel:** premium, calm, smart, playful, morning-friendly. **Avoid:** childish brain iconography, "kids puzzle app" energy.

**Style:** soft gradients, rounded cards, clean typography, smooth micro-animations, coffee/morning-energy influence, brain+brew theme used subtly rather than literally.

**Color direction:** deep navy, warm cream, electric mint/violet accent, gold for streaks/tournaments.

**Brand vibe:** "A premium morning ritual for your mind."

---

## 20. Current Status

Phase 0 in progress. Expo TypeScript project scaffolded (`blank-typescript` template, SDK 57). Private GitHub repo created and being connected. No backend, no accounts, no AI generation yet — by design, per Section 18.
