# RC1 Test Plan

Run on a **real device** against the **release-configuration** build (not the dev
client). Every step states what to observe. "It didn't crash" is not a pass.

Device of record: Samsung S21+ (`RFCR10H7A3K`). At least one additional device or
screen size should be used for the layout pass.

---

## A. Cold start & first run

| # | Step | Pass criteria |
|---|------|---------------|
| A1 | Fresh install, first launch | Splash → Home, no flash of the wrong background. Launcher name reads **BrainBrew** (not `brainbrew-app`). |
| A2 | Onboarding | Username validated server-side; taken names rejected; country saved. |
| A3 | Home | Today's pack, 5 categories, correct UTC date. |
| A4 | Kill and relaunch | Same identity, same profile, no re-onboarding. |

## B. The ranked invariant (the thing that must never break)

| # | Step | Pass criteria |
|---|------|---------------|
| B1 | Play today's ranked brew to completion | One score, locked. |
| B2 | Try to start ranked again | Refused — the completed state shows, no second attempt. |
| B3 | **Kill the app mid-brew (after slot 3)** | Relaunch → "Continue Ranked Brew" → resumes at slot 4 with 1–3 preserved. |
| B4 | **Kill the app after answering slot 5 but before the score screen** | Relaunch → the attempt COMPLETES (does not hang, does not burn the attempt). *Regression: this used to be unrecoverable.* |
| B5 | Complete ranked on device A, then open device B | Home shows the completed state — **not an infinite spinner**. *Regression.* |
| B6 | Airplane mode mid-brew, then restore | Calm error + Try again; answers already submitted are not lost. |
| B7 | Premium active | Ranked limit is still exactly 1/day. No extra attempts, no retries. |

## C. Premium purchase (Play sandbox — only after Play verification)

| # | Step | Pass criteria |
|---|------|---------------|
| C1 | Open Premium | Both plans, store-localized prices, no hard-coded price. |
| C2 | Buy monthly | SDK success does **not** unlock. UI shows "Finalizing access…". |
| C3 | Server confirms | "You're Premium" + Archives unlock. |
| C4 | Cancel the purchase sheet | Neutral message, buttons recover, nothing charged. |
| C5 | Double-tap a plan | One purchase only. |
| C6 | **Restore purchases** (reinstall, same account) | Server-confirmed Premium returns. *Not certifiable on the Test Store — Play only.* |
| C7 | **Cancel the subscription in Play** | `CANCELLATION` webhook → state reflects it. |
| C8 | **Refund** | `revoked` → Premium and Archives removed. |
| C9 | Let it expire | "Premium has expired", Archives re-lock. |
| C10 | Sign into a different BrainBrew account | No Premium leak. Document the RevenueCat transfer behaviour actually observed. |

## D. Archives (Premium)

| # | Step | Pass criteria |
|---|------|---------------|
| D1 | Open Archives | Past packs listed; today is not archivable. |
| D2 | Play an archive brew fully | `ARCHIVE BREW · UNRANKED`; no global/country rank; no percentile. |
| D3 | **Interrupt an archive mid-brew and restart it** | Resumes at the next unanswered slot. *Regression: it used to re-open slot 1, fail `already_submitted`, and permanently break that date.* |
| D4 | After the archive | Today's ranked brew is still available and unaffected; streak unchanged. |
| D5 | Lose Premium (expiry) | Archives lock again. |

## E. Failure injection

Each must fail **safely**: no lost progress, no corrupted score, no wrongly-consumed
ranked attempt, no client-side Premium unlock.

- No internet at launch / mid-brew / at submit / at complete.
- Server timeout (15 s cap) — calm copy, retry works.
- 401 / expired JWT mid-session.
- Kill during: pack load, attempt start, open-puzzle, submit, complete.
- Background during a timed engine; lock the phone; rotate; low memory.
- Network switch (Wi-Fi ↔ LTE) mid-request.
- Rapid double-taps on every primary button.

## F. Accessibility (TalkBack ON)

- Answer a puzzle → the verdict, score and explanation are **announced**.
- Every error is announced.
- Loading states announce "Loading".
- Every button announces a role and a label; disabled buttons announce as disabled.
- Font scale 200% — no clipped text on Home, Results, Premium.
- Known gap: the puzzle stimuli themselves are not screen-reader playable
  (KNOWN_LIMITATIONS).

## G. Performance

- Cold start to interactive Home (record the number; there is no target yet).
- Timed engines: taps register with no perceptible lag.
- No dropped frames on Results (count-up) or Leaderboard scroll.
- Memory stable across 10 brews (no growth per session).
