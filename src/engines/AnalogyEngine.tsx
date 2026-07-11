import { StyleSheet, Text, View } from 'react-native';

import { PuzzleFrame } from '../components/PuzzleFrame';
import { useElapsed } from '../hooks/useElapsed';
import { CATEGORY_ACCENTS, colors, radius, spacing } from '../theme/theme';
import type { AnalogyPuzzle } from '../types/puzzle';
import { MultipleChoice } from './MultipleChoice';
import type { EngineProps } from './types';

/** Language Logic — reasoning expressed through language (§3). */
export function AnalogyEngine({
  puzzle,
  revealed,
  onAnswer,
}: EngineProps<AnalogyPuzzle>) {
  const elapsed = useElapsed();
  const [given, asked] = puzzle.relation;

  return (
    <PuzzleFrame category="language-logic" engine={puzzle.engine} prompt={puzzle.prompt}>
      <MultipleChoice
        accent={CATEGORY_ACCENTS['language-logic']}
        options={puzzle.options}
        correctOptionId={puzzle.correctOptionId}
        revealed={revealed}
        onSelect={(optionId) =>
          onAnswer({ kind: 'choice', selectedId: optionId, elapsedMs: elapsed() })
        }
        stimulus={
          <View style={styles.relation}>
            <Text style={styles.given}>{given}</Text>
            <Text style={styles.asked}>{asked}</Text>
          </View>
        }
      />
    </PuzzleFrame>
  );
}

const styles = StyleSheet.create({
  relation: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
  },
  given: { fontSize: 19, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5 },
  asked: { fontSize: 19, fontWeight: '700', color: colors.text, letterSpacing: 0.5 },
});
