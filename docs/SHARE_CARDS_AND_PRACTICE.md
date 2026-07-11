# Share Cards & Practice Foundation (Phase 7A)

Two related product foundations, built without any payments:

1. A **privacy-safe daily/practice result Share Card** (a generated image).
2. A structured **unranked Practice mode** that a future Premium tier can build on.

The ranked daily Brew stays free and one-per-UTC-day. **No user may ever buy or
receive an extra ranked attempt.** This phase adds **no** subscriptions, payments,
paywalls, entitlements, archives, friends, or Apple Sign-In.

Read [`BRAND_GUIDELINE.md`](BRAND_GUIDELINE.md),
[`RANKED_DAILY_ATTEMPTS.md`](RANKED_DAILY_ATTEMPTS.md),
[`DAILY_LEADERBOARDS.md`](DAILY_LEADERBOARDS.md), and
[`PLAYER_PROGRESS_AND_STREAKS.md`](PLAYER_PROGRESS_AND_STREAKS.md) first.

---

## Part A — Share Cards

### 1. Snapshot data contract (`src/cloud/shareSnapshot.ts`)

The card renders **only** a frozen `ShareSnapshot` — so the exported image cannot
leak anything the snapshot doesn't carry:

```
generatedAt, sessionType ('ranked'|'practice'|'local'), date,
brewScore, totalSolveMs, categories[5]{category, points, state},
streak (ranked only), caption, updatedAfterValidation (ranked only),
username (null by default)
```

`buildShareSnapshot()` freezes `generatedAt` and validates the result through a
**recursive forbidden-field guard** (`SHARE_FORBIDDEN`) that rejects — at any
depth — answers/answer keys (`correctOptionId`, `selectedId`, …), `prompt`,
`user_id`, `attempt_id`, `email`, tokens, provider, integrity reasons, and raw
submissions. **Username and country are omitted by default** (no privacy-setup
screen required); a username would appear only behind an explicit future
user-controlled preference.

### 2. Visual design (`src/components/ShareCard.tsx`)

A premium square card (default 340², scales proportionally): deep-navy surface,
cream type, the BrainBrew mark/wordmark, the UTC date, a prominent BrewScore,
five category marks in **fixed order** (Observation → Attention Speed), a
`RANKED BREW` / `PRACTICE BREW · UNRANKED` chip, the ranked streak (ranked only),
and the tagline *"Five minutes. Sharper every morning."* **Gold** appears only for
a genuine high score (≥85) or a ≥7-day streak. No cartoon brain, gradients,
confetti, fake stats, or answer-revealing symbols. It reads at small preview
sizes.

### 3. Category representation (spoiler-free)

Each category shows the branded `CategoryMark` + a state glyph (`✓` correct, `◐`
partial, `·` missed) + points out of 20 — **never colour alone** (glyph + number +
accessible label), and **never** the puzzle answer.

### 4. Image generation (Task 4)

Platform-split so the web bundle never pulls in native modules:

- **Web** (`shareImage.web.ts`) — `html-to-image` captures the card's DOM node to a
  PNG data URL (device-pixel-ratio aware, targets ~1080²). Verified on web.
- **Native** (`shareImage.ts`) — `react-native-view-shot` `captureRef` → a stable
  1080² PNG in the OS cache dir (nothing persisted). Android-dev-build ready.

Generation runs **only** when the user taps Share, is cached per result and reused
on repeat taps, and is invalidated when the result changes or the screen unmounts.
No backend image service; no persistent image cache.

### 5. Native / web share (`useShareCard.ts`, `ShareSheet.tsx`)

- **Native** — `expo-sharing` share sheet (unavailable → honest "Sharing isn't
  available" copy).
- **Web** — the **Web Share API** with the file when `navigator.canShare({files})`
  is supported; otherwise a **download** ("Image saved to your device"). Never
  claims native sharing where unavailable. Cancellation is handled; rapid taps are
  collapsed (one in-flight share); the image is never uploaded anywhere.

### 6. Share events (Task 6)

`logShareEvent` emits `share_requested / completed / cancelled / failed` to the
**dev console only** — no analytics platform, no image, no share target, no social
account stored. Deliberately minimal.

### 15. Immutable snapshot / recalculation

A ranked card is generated from the **current authoritative score at share time**
and marked `updatedAfterValidation` when applicable. Once exported the image is
**frozen** — a later puzzle-void recalculation does **not** edit it; the app's live
score stays authoritative everywhere else. No server-side archive of generated
images.

---

## Part B — Practice Foundation

### 7. What Practice is

Practice is **unranked, optional** additional play. It **never** affects the ranked
score, leaderboards, ranked streak, ranked statistics, ranked history, or rank
eligibility — because every ranked surface filters `is_ranked` (practice is
`is_ranked = false`). Cloud practice still uses **server-authoritative scoring**.
Consistent product term: **"Practice Brew."**

### 8–10. Entry points, policy & content

- **Entry points** — after ranked completion (Results → *Practice Brew*), and Home
  after ranked completion (*Practice Today's Pack*). Anonymous users keep **Guest
  Brew** and never see permanent-account language.
- **Policy (7A)** — **unlimited unranked practice during beta** (a documented
  temporary benefit). Simplest, best for testing, no fake paywall. `PracticeAccessPolicy`
  is the seam a future Premium tier plugs into. **Phase 7D** wires cloud mode to
  derive it from the server entitlement contract (`get_my_entitlements`); see
  [`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md).
- **Content (7A → 7B)** — 7A practice replayed today's pack. **Phase 7B replaced
  that with fresh server-selected Practice packs from approved reserve content** —
  see [`RESERVE_BASED_PRACTICE.md`](RESERVE_BASED_PRACTICE.md). Practice is now five
  reserve puzzles (fixed rhythm, never today's ranked, deterministic server
  selection, no answers to the client, no daily-pack mutation).

### 11. Attempt purpose (migration `20260717090000_attempt_purpose.sql`)

`attempts.attempt_purpose` enum (`ranked` / `practice` / `guest`), **server-derived
on insert** by a trigger (a client-supplied value is overwritten):

- `is_ranked = true` → `ranked`
- unranked, owner is a **permanent** account → `practice`
- unranked, anonymous/absent owner → `guest`

Purely additive: ranked isolation still rests on `is_ranked` (practice can't enter
`ranked_result_projection`, leaderboards, streaks, or progress; can't satisfy the
one-ranked-per-day unique index; can't be flipped ranked by a client — no write
grant). The field lets future entitlements/analytics tell practice from guest.

### 12. Practice Results UX

Practice Results show: `PRACTICE BREW · UNRANKED`, the BrewScore, category results,
solve time, **Share Result**, **Play another Practice Brew**, **Back to home**.
They **never** show global/country rank, ranked percentile, a streak increase,
"score locked", or daily-ranked-completion copy. The share card is labelled
**Practice Brew · Unranked**.

### 13. Future Premium boundary (`practicePolicy.ts`)

`currentPracticeAccess()` returns the approved beta policy (unlimited practice;
archives/category-training off). Screens read it for **copy/affordances only** —
the **server** remains authoritative for any future limited cloud access. No
subscription table, no payment provider, no fake premium flags.

> **Free forever:** daily ranked Brew, leaderboards, streaks, Share Card, (beta)
> practice. **Future Premium (not built):** unlimited practice enforcement,
> archives, category training, advanced statistics, bonus packs, themes, private
> tournaments. **Never** sold: extra ranked attempts.

---

## 16. Performance

Share generation is on-demand only (never automatic), so the BrewScore reveal and
the independent leaderboard/streak summaries are unaffected. The card image is
cached for the current result and cleared on result change/unmount. Practice entry
adds nothing to Home's critical pack/status path.

## 17. Security & privacy (enforced + tested)

No answers, tokens, user UUIDs, attempt ids, provider/email, integrity reasons, or
private leaderboard fields in a snapshot (recursive guard, on native **and** web).
Practice attempts are excluded from ranked surfaces, cannot update the ranked
score, cannot extend the streak, cannot enter leaderboards, and cannot be marked
ranked by a client.

## 18. Local mode

Local mode is unchanged and offline: results are labelled **Practice/Local**, the
Share Card works where supported (web capture/download), the dev pack switcher is
untouched, local practice is unrestricted, and no Supabase or fake ranked/streak
data is involved.

## 19. Tests

- `npm run db:share-practice-test` — attempt_purpose derivation (ranked/practice/
  guest, client value overwritten), ranked-uniqueness untouched, practice excluded
  from leaderboard/streak/projection, client can't mark practice ranked.
- `npm run cloud:share-practice-check` — the same isolation against the **deployed**
  functions (ranked + practice brew, purpose inspection, score/streak/leaderboard
  unchanged, projection excludes practice, no wire answer leak).
- `npm run test:cloud` — snapshot builder/validator (fixed category order, frozen
  `generatedAt`, recursive rejection of answers/ids/tokens/prompt, username/country
  omitted, recalculated state), share text, and the practice policy.

Native capture/share and the web share-sheet/download UX are verified in a browser
(Task 21) — not claimed here beyond what automated checks cover.
