# Known Limitations (as of Phase 7K)

Everything here is **known, deliberate, and unfixed**. Nothing in this file is a
surprise waiting to be discovered in production. If it is not written down here, it
is either fixed or we do not know about it — and the second category is the one that
should worry you.

---

## Performance

### 1. The local puzzle library is still built at startup (~370 ms of blocking JS)

**What:** `src/content/library.ts` constructs every puzzle pool at **module load**.
`App → useGameplaySession → getGameplayService → localGameplayService → dailyPack →
packs → content/library` is a static import chain, so a cloud-mode cold start still
pays for content it will never read (in cloud mode, packs come from the server).

**Measured** (esbuild bundle evaluated in a Node/V8 harness, median of 5):
`448 ms → 410 ms` after making pack *assembly* lazy in 7K. The remaining ~410 ms is
the library pools themselves. The absolute number will not transfer to Hermes on a
mid-range Android — treat it as relative, not a device figure.

**Why not fixed:** the fix is to make the library's ~30 exported pools lazy, which
changes the public API of the content module — consumed by the content pipeline
(`scripts/compile.mjs`, `scripts/db/build-rows.mjs`, `authoringBoundary.ts`) as well
as the app. That is a wide, mechanical change with real regression surface, and it is
not something to land unverified immediately before an RC.

**Recommended fix (post-RC1):** convert each `export const POOL = [...].map(build)` to
a memoized `export const pool = () => ...`, or make `getGameplayService` load the
local service via dynamic import so cloud never touches the chain.

### 2. Timed engines re-render ~10× more than needed

`useTimedTask` ticks every 100 ms and setStates on every tick, but the only consumer
renders whole seconds (`Math.ceil(ms/1000)`). Symbol Sweep therefore forces ~110–140
re-renders of a 25-tile grid per puzzle. Not a correctness bug and not visibly janky
on the S21+, but it is wasted work during the one task that measures tap latency.
Fix is a one-line state guard in `useTimedTask`; deferred because the timed engines
are the highest-risk thing to touch without a device regression pass.

### 3. Results screen re-renders on every count-up frame

`useCountUp` holds the animating number in `ResultsScreen`'s own state, so the whole
results tree (5 breakdown rows, streak, rank, share sheet) reconciles ~54 times over
the 900 ms count. Fix: move the hook into a leaf `<CountUpScore>` component.

### 4. Leaderboard `FlatList` is unoptimised

Inline `renderItem`, unmemoized row component, no `getItemLayout` (rows are a fixed
64 dp, so it is safe to add). Pagination is uncapped. Bites only on a large board.

---

## Lint

68 ESLint **warnings**, 0 errors. Two rules are deliberately warnings:

- **`react-hooks/refs` (55×)** — fires on `useRef(new Animated.Value(x)).current`,
  which is the idiom React Native's own docs prescribe. The rule targets React
  Compiler memoization semantics; in RN the `Animated.Value` is a stable mutable
  handle that never participates in render output. The real cost is one discarded
  allocation per render. Converting 55 animated call sites with no way to visually
  regression-test each animation is a worse risk than the allocation.
- **`react-hooks/set-state-in-effect` (10×)** — the cloud hooks' `setPhase('loading')`
  at the top of a load effect. Costs one extra render pass on mount; not a
  correctness bug.

Where the compiler rules found genuinely impure render work (`useElapsed` calling
`Date.now()` during render), it was **fixed**, not suppressed.

---

## Accessibility

Fixed in 7K: the app now announces results, errors, loading and purchase outcomes;
spinners are labelled; Profile edit rows are buttons; `textFaint` meets WCAG AA.

**Still open:**

- **The puzzle engines themselves are not screen-reader playable.** `MatrixCompletion`,
  `RotationMatch` and the observation engines draw their stimuli from unlabelled
  `View`s. A TalkBack user cannot perceive the puzzle. The two timed Attention-Speed
  engines are likely unusable under TalkBack by construction. **This is a product
  decision, not a bug fix** — it needs a designed non-visual representation, not an
  `accessibilityLabel` sprinkled on a `View`. It is the single largest a11y gap.
- Route changes do not announce (there is no react-navigation; `App` swaps a keyed
  `AnimatedMount`), so TalkBack focus resets silently on navigation.
- Leaderboard/results rows read as disconnected fragments rather than one sentence.
- `colors.border` (1.42:1) is the sole boundary of a couple of controls; WCAG 1.4.11
  wants 3:1. Not fixable without a visual change.

---

## Product / flow

- **"Play this Archive Brew again"** on the Results screen actually starts a
  *Practice* brew (`actions.restart()` is hard-coded to practice). Mislabelled button.
- **Home does not refresh on foreground.** If the app is backgrounded on Home and
  resumed after the UTC rollover, it still shows yesterday's completed state and will
  not offer today's ranked brew until it is force-quit. **This is the most likely
  real-world way a player loses a day** and is the top candidate for the next fix.
- **Identity switch does not reset the gameplay/rank/progress caches.** Sign out →
  continue as guest shows the previous user's Home status, rank and streak until
  relaunch. Server invariants hold (no second ranked attempt is possible), but the
  client displays another account's data.
- A transient `get_today_player_status` failure silently downgrades today's ranked
  brew to an unranked one, with no error and no retry shown.

---

## Store / billing

- **Google Play sandbox is uncertified** (Play verification pending). Restore →
  Premium, user-initiated cancellation, and refunds can only be exercised there.
- **RevenueCat Restore Behavior is "Transfer to new App User ID"** — undecided.
  "Keep with original App User ID" is not certified.
- The Test Store cannot restore and never sends `CANCELLATION`; it terminates via
  `EXPIRATION` after 5 auto-renewals. Documented in
  [PREMIUM_TEST_STORE_CERTIFICATION.md](PREMIUM_TEST_STORE_CERTIFICATION.md).

---

## Analytics

KPI rollups exclude by `analytics_subject_flags.exclude_from_business_kpis`, not by
`environment`. The QA identities used during certification are **still counted** until
they are flagged.
