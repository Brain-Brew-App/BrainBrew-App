import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CATEGORY_ACCENTS, colors, MIN_TAP_TARGET, radius } from '../theme/theme';

const ACCENT = CATEGORY_ACCENTS.pattern;

export type ChipState = 'idle' | 'selected' | 'correct' | 'wrong' | 'blank';

interface SequenceChipsProps {
  terms: string[];
  /** Appends a dashed "?" chip. Sequence Completion only. */
  trailingBlank?: boolean;
  /**
   * Present when the chips are the answer space (Sequence Repair). Tappable
   * chips flex to fill the row, so they are as large as the width allows —
   * comfortably ≥48dp on a real phone, and ~45dp at the 320dp extreme, which is
   * the geometric ceiling for six chips in one non-wrapping row (Catalog
   * §PAT_003).
   */
  onTapTerm?: (index: number) => void;
  stateOf?: (index: number) => ChipState;
}

/**
 * The non-wrapping row of sequence terms.
 *
 * A sequence that breaks across two lines stops reading as a sequence, so this
 * never wraps. Sizing is tuned so six chips fit a 320dp screen — which is why
 * terms are capped at three digits by the validator.
 *
 * Sequence Completion renders it as a stimulus; Sequence Repair renders the same
 * row with every chip a 48dp tap target. One component, two engines.
 */
export function SequenceChips({ terms, trailingBlank = false, onTapTerm, stateOf }: SequenceChipsProps) {
  const tappable = Boolean(onTapTerm);

  return (
    <View style={styles.row}>
      {terms.map((term, i) => {
        const state = stateOf?.(i) ?? 'idle';
        const body = (
          <Text style={[styles.text, state === 'wrong' && styles.wrongText]}>{term}</Text>
        );

        if (!tappable) {
          return (
            <View key={i} style={styles.chip}>
              {body}
            </View>
          );
        }

        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`Term ${term}`}
            disabled={state === 'correct' || state === 'wrong' ? true : undefined}
            onPress={() => onTapTerm!(i)}
            style={({ pressed }) => [
              styles.chip,
              styles.tappable,
              state === 'selected' && styles.selected,
              state === 'correct' && styles.correct,
              state === 'wrong' && styles.wrong,
              pressed && styles.pressed,
            ]}
          >
            {body}
          </Pressable>
        );
      })}

      {trailingBlank && (
        <View style={[styles.chip, styles.blank]}>
          <Text style={[styles.text, styles.blankText]}>?</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'center', gap: 6 },
  chip: {
    minWidth: 38,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  /**
   * The chips *are* the answer space, so each flexes to fill the row — as large
   * as the width allows, and always ≥48dp tall (§13).
   */
  tappable: { flex: 1, minHeight: MIN_TAP_TARGET, minWidth: 42 },
  text: { fontSize: 19, fontWeight: '600', color: colors.text },
  selected: { borderColor: ACCENT, borderWidth: 2, backgroundColor: colors.surfaceRaised },
  correct: { borderColor: colors.correct, borderWidth: 2, backgroundColor: colors.surfaceRaised },
  wrong: { borderColor: colors.incorrect, borderWidth: 2 },
  wrongText: { color: colors.incorrect },
  pressed: { opacity: 0.7 },
  blank: { borderColor: ACCENT, borderStyle: 'dashed' },
  blankText: { color: ACCENT },
});
