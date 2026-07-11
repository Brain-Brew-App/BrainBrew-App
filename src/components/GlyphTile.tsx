import { Pressable, StyleSheet, Text } from 'react-native';

import { useHasAnswerKey } from '../engines/revealContext';
import { colors, radius, shadow } from '../theme/theme';

/**
 * How a tile is currently reading to the player. Outcome is always carried by a
 * border *shape change* as well as a colour, never colour alone (§13).
 */
export type TileState = 'idle' | 'selected' | 'correct' | 'wrong' | 'missed';

interface GlyphTileProps {
  glyph: string;
  state?: TileState;
  onPress?: () => void;
  disabled?: boolean;
  /** Tiles in a sweep are dense; tiles in a 3-column grid are not. */
  glyphSize?: number;
  /** Accent for the `selected` state. Defaults to the mint correct colour. */
  accent?: string;
  /** Sweep grids are 20–25 tiles: the card shadow becomes noise at that density. */
  elevated?: boolean;
}

/**
 * A square, tappable tile holding one glyph.
 *
 * Odd One Out, Pair Find, Symbol Sweep and Memory Flash all draw the same tile.
 * They previously each drew their own, and had already drifted: three different
 * border widths, two different pressed states, one missing the top-edge
 * highlight. Sizing comes from the parent `Grid`, so a tile is always ≥48dp.
 */
export function GlyphTile({
  glyph,
  state = 'idle',
  onPress,
  disabled = false,
  glyphSize = 28,
  accent = colors.correct,
  elevated = true,
}: GlyphTileProps) {
  // Without the answer key (cloud mode), an engine cannot know which tile was a
  // target — so a "correct"/"wrong"/"missed" reveal would be a guess. Degrade to
  // neutral: the player's tapped tiles read as `selected`, untapped as `idle`;
  // the server verdict is shown by the RevealCard. Engines that CAN determine
  // targets from public data (Symbol Sweep, via glyph match) opt back in with
  // their own AnswerKeyProvider.
  const hasKey = useHasAnswerKey();
  if (!hasKey) {
    if (state === 'correct' || state === 'wrong') state = 'selected';
    else if (state === 'missed') state = 'idle';
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tile ${glyph}`}
      accessibilityState={{ selected: state === 'selected', disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        elevated && shadow.card,
        state === 'selected' && { borderColor: accent, borderWidth: 2, backgroundColor: colors.surfaceRaised },
        state === 'correct' && styles.correct,
        state === 'wrong' && styles.wrong,
        state === 'missed' && styles.missed,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.glyph, { fontSize: glyphSize }, state === 'wrong' && styles.wrongGlyph]}>
        {glyph}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    backgroundColor: colors.surface,
  },
  correct: { borderColor: colors.correct, borderWidth: 2, backgroundColor: colors.surfaceRaised },
  wrong: { borderColor: colors.incorrect, borderWidth: 2 },
  /** A target that was there and was not tapped. */
  missed: { borderColor: colors.violet, borderWidth: 2, borderStyle: 'dashed' },
  pressed: { opacity: 0.7 },
  glyph: { color: colors.text },
  wrongGlyph: { color: colors.incorrect },
});
