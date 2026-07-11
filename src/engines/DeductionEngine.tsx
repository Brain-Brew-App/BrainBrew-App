import { StyleSheet, Text, View } from 'react-native';

import { PuzzleFrame } from '../components/PuzzleFrame';
import { useElapsed } from '../hooks/useElapsed';
import { CATEGORY_ACCENTS, colors, radius, spacing, typography } from '../theme/theme';
import type { DeductionPuzzle } from '../types/puzzle';
import { MultipleChoice } from './MultipleChoice';
import type { EngineProps } from './types';

/** Logic — short deduction from stated premises. */
export function DeductionEngine({ puzzle, revealed, onAnswer }: EngineProps<DeductionPuzzle>) {
  const elapsed = useElapsed();

  return (
    <PuzzleFrame category="logic" engine={puzzle.engine} prompt={puzzle.prompt}>
      <MultipleChoice
        accent={CATEGORY_ACCENTS.logic}
        options={puzzle.options}
        correctOptionId={puzzle.correctOptionId}
        revealed={revealed}
        onSelect={(optionId) =>
          onAnswer({ kind: 'choice', selectedId: optionId, elapsedMs: elapsed() })
        }
        stimulus={
          <View style={styles.premises}>
            {puzzle.premises.map((premise, i) => (
              <View key={i} style={styles.premiseRow}>
                <Text style={styles.bullet}>{i + 1}</Text>
                <Text style={styles.premiseText}>{premise}</Text>
              </View>
            ))}
          </View>
        }
      />
    </PuzzleFrame>
  );
}

const styles = StyleSheet.create({
  premises: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  premiseRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  /** Fixed width + no letter-spacing, so premise text starts on the same x. */
  bullet: {
    ...typography.label,
    letterSpacing: 0,
    width: 12,
    color: CATEGORY_ACCENTS.logic,
    lineHeight: 22,
  },
  premiseText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 22 },
});
