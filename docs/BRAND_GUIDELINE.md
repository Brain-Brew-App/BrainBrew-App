# BrainBrew Brand Guideline

Governs how the mascot logo, color, type, and motion get used across the app, store listings, and marketing. Read this before touching anything visual — icons, splash, share cards, marketing pages, loading states.

This supersedes the "avoid childish brain iconography" line in [`CORE_SPEC.md`](CORE_SPEC.md) §19 for logo/mascot decisions specifically. The mascot — a running, sneakered brain character with motion lines — is the deliberate, final brand mark. Everything below documents that direction, not an alternative to it.

---

## 1. The mark

Three source files exist; each has one job. Never substitute one for another.

| File | Format | Use for |
|---|---|---|
| `BrainBrewLogoTransparent.png` | 1536×1024, RGBA, real alpha | **Primary source.** Every app icon, splash, and in-app placement is cropped from this file. Never use anything else as a crop source. |
| `BrainBrewLogo.png` | 1594×987, opaque white background | Full lockup (character + "BRAINBREW" wordmark) for contexts that need a flat white background: App Store/Play Store marketing screenshots, email signatures, printed material. Never used on-device. |
| `BrainBrewIcon.png` | 1536×1024, RGBA | Has a rounded-frame/glow baked into the pixels. **Not usable as an app icon slot** — the OS applies its own mask, and this file's pre-baked frame will double up or clip. Reference only, not a source for exports. |

The character crop used for every icon export is `x=380..1132, y=128..628` (752×500) out of `BrainBrewLogoTransparent.png` — the character only, wordmark excluded. That crop rectangle lives in `prepare-icons.ps1` at the project root's parent folder; treat it as the canonical source-of-truth crop if any asset needs regenerating.

### Clear space and minimum size
- Clear space around the character: at least 15% of the character's own width on every side, before any other UI element or edge.
- Never render the character below 32px on any axis — the interior brain folds and shoe gradient collapse into noise below that.
- Never stretch, skew, rotate, recolor, or add a drop shadow/glow beyond what's already baked into the source art. It's fully rendered already; treat it as a locked asset, not a template.
- Never place the character on a busy, colored, or light background. It's built for **navy (`#0A1020`) or cream (`#F5EEE1`) surfaces only** — every color in the character itself was tuned against navy.

---

## 2. Color

### Mascot palette (sampled directly from the source PNG's pixels — not guessed)

| Swatch | Hex | Role |
|---|---|---|
| Brand Violet | `#421F87` | Linework/outline — every stroke on the character, and the wordmark. Extremely consistent across the art (tight single cluster, not a gradient), so treat it as flat, not a range. |
| Brand Pink — light | `#FC6DB9` | Brain fill, highlight edge |
| Brand Pink — deep | `#DE4392` | Brain fill, shadow edge |
| Brand Cyan — light | `#3DC8E7` | Shoe fill, highlight edge |
| Brand Cyan — deep | `#1180AF` | Shoe fill, shadow edge |

### Relationship to the existing UI palette (`src/theme/theme.ts`)

The mascot's palette and the app's interface palette are **deliberately different registers** and should stay that way:

- **Mascot colors** (hot pink, cyan, violet) are saturated and playful — they exist to give the character personality and appear *only* as the character itself.
- **UI colors** (`mint #5EE7C3`, `violet #A78BFA`, `gold #E8B44A`, on `navy #0A1020` / `cream #F5EEE1`) are restrained and exist to make the puzzles legible and calm.

**Rule:** never pull mascot pink/cyan into functional UI — buttons, category accents, feedback states, charts. Those stay reserved for the character. This is what keeps `correct`/`incorrect` (mint/rose) and category accents unambiguous: if pink or cyan ever showed up as a UI color, a user's eye could momentarily read it as "the mascot" instead of "a state." The two palettes coexist by staying visually separate, not by matching.

The app's real background token is `palette.json`'s `#0A1020` (not `#0B1226` — that was an earlier approximation and has been corrected in the generated icon assets to match exactly).

---

## 3. Typography

Already established in `src/theme/theme.ts` and correctly reflected in the current wordmark rendering (`Brain` in cream bold serif, `Brew` in mint) — no change needed here, just documenting the rule so it's not accidentally drifted from:

- **Display/heading font:** Georgia (iOS) / serif (Android) / Georgia-fallback stack (web) — carries brand voice.
- **Body/UI font:** system sans — carries the actual puzzle-solving work.
- **Wordmark lockup:** "Brain" in `colors.text` (`#F5EEE1`), weight 700; "Brew" in `colors.mint` (`#5EE7C3`), same weight. This is the one place mint is allowed to touch the wordmark — it's a UI accent standing in for "fresh/brewed," not a mascot color.
- Never apply the display serif to numerals (BrewScore, timers) — old-style figures in Georgia/serif drop below the baseline at large sizes. Numerals always render in the system sans, per the existing `typography.score` token.

---

## 4. Icon asset set

Six files, generated from the primary source crop, each sized for its slot's real safe-area convention (not a single icon dumped into every slot):

| File | Canvas | Background | Character width |
|---|---|---|---|
| `icon.png` | 1024×1024 | Opaque `#0A1020` | 75% (iOS/main icon safe margin) |
| `android-icon-foreground.png` | 1024×1024 | Transparent | 60% (Android adaptive icon's tighter safe zone) |
| `android-icon-background.png` | 1024×1024 | Opaque `#0A1020`, no character | — |
| `android-icon-monochrome.png` | 1024×1024 | Transparent, flat white silhouette (alpha-masked) | 60% (Android 13+ themed icon) |
| `splash-icon.png` | 1024×1024 | Transparent | 45% (renders small/centered on the splash) |
| `favicon.png` | 192×192 | Opaque `#0A1020` | 75% |

All six live in `assets/` and are wired into `app.config.js` already. If the source art or crop ever changes, regenerate all six from the same script rather than hand-editing one — the width-fraction/background rules above are what keep them consistent with each other.

---

## 5. Motion direction (loading / splash animation)

The character is already drawn mid-run with motion lines baked in — the art itself implies motion, which sets the animation direction: **make the still image feel alive without redrawing it.**

Two viable approaches, in order of what to build first:

**1. Cheap, ship-now version (recommended for now).** Animate the existing static `splash-icon.png` with React Native's `Animated` API: a slow scale pulse (0.96 → 1.0, ~900ms ease-in-out, looping) on the character, combined with the motion-line strokes at the character's left edge fading their opacity in a staggered loop (~150ms offset between each line). Transform + opacity only, per this project's own animation rule (see `src/theme/motion.ts` and the `usePressScale` pattern already used in `Button.tsx`/`OptionButton.tsx` — reuse that same spring/scale approach rather than inventing a second animation system). No new art required, ships this week.

**2. Later, if it earns it.** A real frame-by-frame run-cycle as a Lottie or Rive animation (legs actually alternating, motion lines extending/retracting). Higher production value, but needs a proper animated source file built in Rive/After Effects — not something to hand-roll from the static PNG. Worth revisiting once there's a reason to invest (e.g., app store screenshots/preview video, or evidence the splash is a moment worth polishing further) — not before. Given this project's stated goal (small, sustainable, not chasing a hit), don't build #2 speculatively.

Don't animate anything else about the mascot outside a loading/splash context — it's a mark, not a decoration; if it's moving everywhere it stops reading as motion and starts reading as noise.

---

## 6. Open question: "Claude design"

You mentioned wanting to use "Claude design" for this but weren't sure how — worth a straight answer rather than guessing: if you meant generating/iterating on visuals through conversation (mockups, icon concepts, this kind of asset work), that's exactly what's happening in this session via Claude's native image tooling — no separate product to learn. If you meant something else (a specific app or feature name you saw somewhere), tell me what it was and I'll tell you whether it's relevant here or whether what we're already doing covers it.
