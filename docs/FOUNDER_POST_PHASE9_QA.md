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
- [ ] **Authoring UI (create → build → validate → preview → review → approve → reserve)** · Authoring · Content/Founder · author a test puzzle · canonical build+validate; two-person approval · **High** · *milestone not yet built — backend live/tested.*

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
