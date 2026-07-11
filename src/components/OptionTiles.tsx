import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useHasAnswerKey } from '../engines/revealContext';
import { usePressScale } from '../theme/motion';
import { colors, MIN_TAP_TARGET, radius, spacing, typography } from '../theme/theme';

export interface TileOption {
  id: string;
  /** What to draw inside the tile. */
  node: ReactNode;
  /** Screen-reader name for the tile. */
  label: string;
}

interface OptionTilesProps {
  options: TileOption[];
  correctOptionId: string;
  revealed: boolean;
  selectedId: string | null;
  onSelect: (optionId: string) => void;
  accent: string;
  columns?: number;
}

/**
 * A grid of pictorial answer tiles. The row-based `OptionButton` cannot carry a
 * drawn shape, so engines whose options are figures (Rotation Match, Matrix
 * Completion) use this instead. Same visual language, same reveal states, same
 * mark-plus-colour feedback (§13) — never colour alone.
 */
export function OptionTiles({
  options,
  correctOptionId,
  revealed,
  selectedId,
  onSelect,
  accent,
  columns = 2,
}: OptionTilesProps) {
  const width: `${number}%` = `${100 / columns}%`;

  return (
    <View style={styles.grid}>
      {options.map((option) => (
        <View key={option.id} style={[styles.cell, { width }]}>
          <Tile
            option={option}
            accent={accent}
            revealed={revealed}
            isCorrect={option.id === correctOptionId}
            isSelected={option.id === selectedId}
            onPress={() => onSelect(option.id)}
          />
        </View>
      ))}
    </View>
  );
}

function Tile({
  option,
  accent,
  revealed,
  isCorrect,
  isSelected,
  onPress,
}: {
  option: TileOption;
  accent: string;
  revealed: boolean;
  isCorrect: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale(0.97);
  // Cloud mode has no answer key: reveal the player's own pick neutrally and let
  // the RevealCard carry the verdict; never mark correctness inline.
  const hasKey = useHasAnswerKey();
  const showCorrect = hasKey && revealed && isCorrect;
  const showWrong = hasKey && revealed && isSelected && !isCorrect;
  const showLocked = !hasKey && revealed && isSelected;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={option.label}
        disabled={revealed}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.tile,
          isSelected && (!revealed || showLocked) && { borderColor: accent, backgroundColor: colors.surfaceRaised },
          showCorrect && styles.correct,
          showWrong && styles.wrong,
          pressed && !revealed && styles.pressed,
        ]}
      >
        <View style={styles.body}>{option.node}</View>
        <View style={styles.markSlot}>
          {showCorrect && <Text style={[styles.mark, { color: colors.correct }]}>✓</Text>}
          {showWrong && <Text style={[styles.mark, { color: colors.incorrect }]}>✕</Text>}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { padding: spacing.xs },
  tile: {
    minHeight: MIN_TAP_TARGET * 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    backgroundColor: colors.surface,
  },
  body: { alignItems: 'center', justifyContent: 'center' },
  correct: { borderColor: colors.correct, backgroundColor: colors.surfaceRaised },
  wrong: { borderColor: colors.incorrect, backgroundColor: colors.surfaceRaised },
  pressed: { backgroundColor: colors.surfaceRaised },
  markSlot: { height: 18, justifyContent: 'center' },
  mark: { ...typography.label, fontSize: 15, fontWeight: '700' },
});
