import { Platform } from 'react-native';

import type { Category } from '../types/puzzle';
import palette from './palette.json';

/**
 * BrainBrew visual tokens — Core Spec §19.
 * "A premium morning ritual for your mind."
 *
 * Deep navy foundation, warm cream foreground, electric mint accent, restrained
 * violet secondary. Gold is reserved for genuine achievement and appears nowhere
 * else. Designed, not decorated: no stock palette, no ambient glow, no gradient
 * for its own sake.
 */

export const colors = {
  /**
   * Elevation layers, warmed slightly toward navy-blue rather than pure slate.
   *
   * `background` lives in palette.json because the Expo config (app.config.js)
   * must read the same value for the splash screen, the native root view and
   * the web page background. It is the one colour that has to exist outside
   * TypeScript, and it is never written down twice.
   */
  background: palette.background,
  surface: '#131B33',
  surfaceRaised: '#1B2444',
  floating: '#232E55',
  border: '#2A3557',
  /** Hairline highlight along the top edge of a raised surface. */
  borderHighlight: '#3A4879',

  // Warm cream foreground.
  text: '#F5EEE1',
  textMuted: '#98A2BF',
  textFaint: '#6B7699',
  /** Ink on mint surfaces — the background colour, inverted onto light. */
  textInverse: palette.background,

  // Accents.
  mint: '#5EE7C3',
  mintPressed: '#3FCBA6',
  violet: '#A78BFA',
  /**
   * Completed progress segments. Dimmer than `violet` so the live segment still
   * reads as live on Attention Speed, whose accent *is* violet.
   */
  violetMuted: '#5E4E93',
  /** Achievement only — never decoration. */
  gold: '#E8B44A',
  /**
   * The mascot's own linework colour, sampled from the source art — every
   * stroke on the running-brain character uses this exact violet. Identity
   * accent only: the BrewMark ring and any splash/marketing moment that wants
   * to echo the mascot. Never a functional UI colour — that's what `violet`
   * above is for. See docs/BRAND_GUIDELINE.md §2.
   */
  brandViolet: '#421F87',

  // Feedback. Always paired with a mark or word, never colour alone (§13).
  correct: '#5EE7C3',
  partial: '#A78BFA',
  incorrect: '#F2748C',
} as const;

/**
 * One accent per category, walking mint → violet across the fixed session order
 * (visual → analytical → logical → verbal → fast). The ramp *is* the rhythm of
 * the pack: each puzzle is tinted a step further along, so the five screens read
 * as one journey rather than five themes.
 */
export const CATEGORY_ACCENTS: Record<Category, string> = {
  observation: '#5EE7C3',
  pattern: '#6FDCD9',
  logic: '#89C4EE',
  'language-logic': '#9AAEF6',
  'attention-speed': '#A78BFA',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** §13: minimum tap target 48dp. */
export const MIN_TAP_TARGET = 48;

/**
 * Tinted, not flat black. React Native allows one shadow per view, so depth is
 * built by pairing a shadow with a hairline top highlight on the surface.
 */
export const shadow = {
  card: {
    shadowColor: '#02050E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 18,
    elevation: 6,
  },
  floating: {
    shadowColor: '#02050E',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 10,
  },
  /** Mint-tinted lift under the primary action. Restrained, not a glow. */
  action: {
    shadowColor: '#1E9B7E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

/**
 * A serif display face carries the brand voice; the system sans carries the
 * work. Deliberately never applied to digits: the system serif on Android and
 * Georgia on web use old-style figures, where 3/4/5/7/9 drop below the
 * baseline — fine in prose, broken in a 72px BrewScore.
 */
export const fonts = {
  display: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: "Georgia, 'Times New Roman', serif",
  }),
} as const;

export const typography = {
  wordmark: { fontFamily: fonts.display, fontSize: 36, fontWeight: '700', letterSpacing: -0.6 },
  /** Numerals: system sans, tight tracking. */
  score: { fontSize: 76, fontWeight: '800', letterSpacing: -2.5 },
  title: { fontFamily: fonts.display, fontSize: 26, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 20, fontWeight: '600' },
  prompt: { fontSize: 20, fontWeight: '600', lineHeight: 28 },
  body: { fontSize: 16, fontWeight: '400' },
  option: { fontSize: 16, fontWeight: '500' },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 19 },
  timer: { fontSize: 22, fontWeight: '700' },
} as const;
