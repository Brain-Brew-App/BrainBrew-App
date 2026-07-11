import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useHasAnswerKey } from '../engines/revealContext';
import { usePressScale } from '../theme/motion';
import { colors, MIN_TAP_TARGET, radius, spacing, typography } from '../theme/theme';

interface OptionButtonProps {
  label: string;
  onPress: () => void;
  /** Once true the row stops accepting taps and shows its outcome. */
  revealed?: boolean;
  isCorrect?: boolean;
  isSelected?: boolean;
  /** The current category's accent, used for the selected border. */
  accent?: string;
}

/**
 * A single multiple-choice row, shared by Pattern, Logic and Language Logic.
 * Outcome is carried by an icon *and* a colour, never colour alone (§13).
 */
export function OptionButton({
  label,
  onPress,
  revealed = false,
  isCorrect = false,
  isSelected = false,
  accent = colors.violet,
}: OptionButtonProps) {
  // Without the answer key (cloud mode) the reveal is NEUTRAL: the player's own
  // choice is highlighted, but nothing is marked right or wrong — the server
  // verdict is carried by the RevealCard, and the correct option is never shown.
  const hasKey = useHasAnswerKey();
  const showCorrect = hasKey && revealed && isCorrect;
  const showWrong = hasKey && revealed && isSelected && !isCorrect;
  const showLocked = !hasKey && revealed && isSelected;
  const { scale, onPressIn, onPressOut } = usePressScale(0.985);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        disabled={revealed}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.row,
          isSelected && (!revealed || showLocked) && { borderColor: accent, backgroundColor: colors.surfaceRaised },
          showCorrect && styles.correct,
          showWrong && styles.wrong,
          pressed && !revealed && styles.pressed,
        ]}
      >
        <Text style={styles.label}>{label}</Text>
        <View style={styles.markSlot}>
          {showCorrect && <Text style={[styles.mark, styles.correctMark]}>✓</Text>}
          {showWrong && <Text style={[styles.mark, styles.wrongMark]}>✕</Text>}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    // Exactly the 48dp floor (§13) for a one-word option; wrapped options grow
    // past it on their own.
    minHeight: MIN_TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  correct: { borderColor: colors.correct, backgroundColor: colors.surfaceRaised },
  wrong: { borderColor: colors.incorrect, backgroundColor: colors.surfaceRaised },
  pressed: { backgroundColor: colors.surfaceRaised },
  label: { ...typography.option, color: colors.text, flex: 1 },
  markSlot: { width: 20, alignItems: 'center' },
  mark: { fontSize: 18, fontWeight: '700' },
  correctMark: { color: colors.correct },
  wrongMark: { color: colors.incorrect },
});
