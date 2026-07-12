# Founder Post-Phase-9 QA Backlog

The Founder will perform comprehensive personal product + Admin QA **after Phase 9**.
Until then, each phase ships automated + security + DB + preview + production smoke
verification, and every item needing eventual human eyes is recorded here. This
backlog does **not** justify skipping automated verification — it complements it.

Each item: **Build/version · Route/screen · Preconditions · Steps · Expected · Risk ·
Evidence required.**

---

## Player app — Auth / account lifecycle
- [ ] Anonymous session created on first open · Home · fresh install · open app · anon session + profile setup prompt · Med · screen recording.
- [ ] Email/Google secure-progress upgrade keeps same UUID + history · Profile · anon session with play history · secure via email/Google · same data after upgrade · **High** · before/after profile + attempts.
- [ ] Account switch / sign-out (permanent) · Profile · permanent account · sign out → sign in · correct account, no cross-session leakage · High · video.

## Ranked gameplay
- [ ] One ranked Brew/UTC day; second attempt blocked · Home/Session · completed today · try to start again · locked with correct copy · **High** · screenshot.
- [ ] Scoring/timing/leaderboard/streak correctness · Results/Leaderboard · complete a ranked Brew · score + rank + streak match server · High · values vs `get_my_*`.
- [ ] Maintenance mode blocks new ranked starts (server-enforced) · Home · admin sets maintenance · start ranked · calm unavailable copy · High · both states.

## Practice / Progress / Streaks / Share
- [ ] Fresh reserve Practice brews, unranked, isolated · Practice · any account · play Practice · never today's ranked; no ranked impact · High.
- [ ] Progress/streak calendar + practice summary correct · Progress · with history · open Progress · matches canonical · Med.
- [ ] Share cards render + export, no answer/PII · Results · after a Brew · share · correct image, no leaks · Med.

## Premium / RevenueCat (sandbox until launch)
- [ ] Premium screen states + purchase/restore (sandbox) · Premium · dev build · run STORE_SANDBOX_TESTING · entitlement syncs; ranked unaffected · **High** · device video. (See STORE_SANDBOX_TESTING.md — device step, not yet run.)

## Admin dashboard — auth/session (the 7H.1 fix)
- [ ] **Normal-browser login persists across an aged session (no bounce to /login)** · admin.brainbrew.dev · normal browser, session >1h old · revisit · stays signed in · **High** · screen recording. (Automated: middleware fix + build; human confirm still valuable.)
- [ ] Incognito login · same · fresh context · works · High.
- [ ] Reset-session recovers a corrupted cookie · /login · stale cookie · click Reset session · re-login works · Med.
- [ ] Account-mismatch page for non-admin · /account · non-admin signed in · visit · clear switch option, no loop · Med.

## Admin dashboard — navigation / performance / data
- [ ] Every route loads fast; grouped nav; active state; tablet width · all routes · Founder · click through · quick, no jump · Med · timings.
- [ ] KPIs/charts show real data with freshness; honest pending/empty · Overview/Users/Retention/Gameplay/Revenue/Investor · Founder · view · no fake numbers · Med.

## Admin — content operations
- [ ] Puzzles list/detail; answer key view is audited · Puzzles · Founder/Content · open puzzle, reveal answer · audited; correct data · High.
- [ ] Retire (unused) / retire blocked (future pack) · Puzzle detail · test fixtures · retire · history kept; future-ref blocked · High.
- [ ] Delete unused draft (reauth + typed confirm); used denied · Puzzle detail · test draft · delete · works only for eligible draft · **High**.
- [ ] **Authoring UI (create → build → validate → preview → review → approve → reserve)** · Authoring · Content/Founder · author a test puzzle · canonical build+validate; two-person approval · **High** · *canonical build/validate boundary live/tested (7H.3.1); 15-engine forms + preview UI still to build (7H.3.2–3).*

## Admin — Observation & Pattern authoring forms (7H.3.2A; automated done, visual/usability deferred)
Route base: `/content/authoring` → `/content/authoring/new/{engineId}`. Use **test** ids only; never a canonical production puzzle id.
- [ ] Each of the 6 forms (OBS_001, OBS_003, OBS_004, PAT_001, PAT_002, PAT_003) renders its field groups; Build & validate shows the validation summary; preview renders at **320dp and 390dp** · Content/Founder · open each engine, keep defaults, Build · passed + preview appears · **High** · screenshot per engine at both widths.
- [ ] Glyph pickers offer only approved glyphs; render risk legible on device (halfCircles/cornerTriangles/etc.) · OBS_001/OBS_004 · pick glyphs · shapes render as shapes, not emoji · **High** · device photo (iOS + Android).
- [ ] Invalid input shows an inline field error and a failing validation summary blocks Save · any form · e.g. OBS_001 oddIndex=0, PAT_002 all-row-constant · Save disabled; clear message · **High** · screenshot.
- [ ] Answer overlay: hidden for a non-reviewer; visible (with explanation) only after ticking Reveal as a reviewer with recent sign-in · preview · Content vs Viewer · reveal · gated + audited · **High**.
- [ ] Save draft persists (draft id shown) then appears in the 7H.2 authoring queue; a failing build cannot be saved · form · Content · Build → Save · draft row created · **High** · audit + row.
- [ ] Unsaved-changes badge appears on edit and clears after Build/Save · form · Content · edit a field · badge toggles · Med.
- [ ] Keyboard-only operation of every control (selects, glyph radio/checkbox grids, difficulty segmented, buttons); focus visible; ≥44–48px targets · all forms · keyboard + screen reader · usable · Med · a11y notes.
- [ ] Tablet/wide layout: two-column form/preview does not overflow; 320dp preview never causes body horizontal scroll · all forms · resize · clean · Med.

## Admin — authoring canonical boundary (7H.3.1, automated; human spot-check deferred)
- [ ] Build a candidate for each of the 15 engines through the form → `buildCandidateAction`; validation findings render clearly; a failing build shows a safe error, never a partial save · Authoring · Content/Founder · *forms not yet built; boundary + action live/tested by `test:authoring-boundary`.* · **High** · screenshots per engine.
- [ ] Answer overlay appears only for reviewer roles with recent auth; hidden otherwise · Authoring preview · Content vs Viewer · reveal answer · gated + audited · **High**.
- [ ] Version-pinning surfaces re-review when a draft is rebuilt under a newer builder/validator (diff shown) · Authoring · Content · rebuild · stale review cleared · Med.

## Admin — pack operations (milestone)
- [ ] Draft pack create/suggest/validate/schedule/publish (isolated future test date); live mutation blocked; void fixture · Packs · Founder/Content · *not yet built — read pages + safety rules live.* · **High**.

## Admin — support / exports / health / maintenance / incidents / audit
- [ ] User Support lookup (safe fields); mark test subject audited · Support · Founder/Support · search · no PII beyond policy · Med.
- [ ] CSV exports role-safe + audited · Reports · Founder/Finance · download · aggregate only, no PII · Med.
- [ ] Health checks; maintenance (reauth); incidents open/resolve; audit shows actions · Operations · Founder/Eng · exercise · correct + audited · Med.

## Platforms / accessibility / polish / recovery / performance
- [ ] Android (dev build), iOS (when Apple setup ready), Web · all · builds · smoke each · parity · High.
- [ ] Accessibility (contrast, tap targets, color+label), visual polish, error recovery (network loss, retries), performance budgets · all · — · review · meets bar · Med.

## How this is maintained
Each subsequent phase appends its new human-review items here and marks automated
coverage that already de-risks them. Items tagged *milestone not yet built* track
deferred scope with a live/tested backend where applicable.
