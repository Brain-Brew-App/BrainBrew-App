import { StyleSheet, Text, View } from 'react-native';

import { BalanceScale } from '../components/BalanceScale';
import { PuzzleFrame } from '../components/PuzzleFrame';
import { useElapsed } from '../hooks/useElapsed';
import { CATEGORY_ACCENTS, colors, radius, spacing, typography } from '../theme/theme';
import type { BalanceScalesPuzzle } from '../types/puzzle';
import { MultipleChoice } from './MultipleChoice';
import type { EngineProps } from './types';

const ACCENT = CATEGORY_ACCENTS.logic;

/**
 * `LOG_002` Balance Scales — logic you can see.
 *
 * This engine exists to repair a structural fairness gap: Logic was otherwise
 * entirely prose, which quietly made it a second English test for non-native
 * speakers in a category that is not supposed to measure language (Core Spec
 * §2.1, §3). The prompt is one sentence; the puzzle is a diagram.
 */
export function BalanceScalesEngine({
  puzzle,
  revealed,
  onAnswer,
}: EngineProps<BalanceScalesPuzzle>) {
  const elapsed = useElapsed();

  return (
    <PuzzleFrame category="logic" engine={puzzle.engine} prompt={puzzle.prompt}>
      <MultipleChoice
        accent={ACCENT}
        options={puzzle.options}
        correctOptionId={puzzle.correctOptionId}
        revealed={revealed}
        onSelect={(optionId) =>
          onAnswer({ kind: 'choice', selectedId: optionId, elapsedMs: elapsed() })
        }
        stimulus={
          <View style={styles.scales}>
            {puzzle.scales.map((scale, i) => (
              <View key={i} style={styles.scaleRow}>
                <BalanceScale scale={scale} tone={ACCENT} />
              </View>
            ))}
            <Text style={styles.query}>
              How many <Text style={styles.glyph}>{puzzle.query.unit}</Text> balance one{' '}
              <Text style={styles.glyph}>{puzzle.query.subject}</Text>?
            </Text>
          </View>
        }
      />
    </PuzzleFrame>
  );
}

const styles = StyleSheet.create({
  scales: {
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
  },
  scaleRow: { paddingVertical: spacing.xs },
  query: {
    ...typography.body,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  glyph: { fontSize: 19, color: colors.text },
});
