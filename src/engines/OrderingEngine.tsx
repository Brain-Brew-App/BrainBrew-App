import { StyleSheet, Text, View } from 'react-native';

import { OrderingInput } from '../components/OrderingInput';
import { PuzzleFrame } from '../components/PuzzleFrame';
import { useElapsed } from '../hooks/useElapsed';
import { CATEGORY_ACCENTS, colors, radius, spacing, typography } from '../theme/theme';
import type { OrderingPuzzle } from '../types/puzzle';
import type { EngineProps } from './types';

const ACCENT = CATEGORY_ACCENTS.logic;

/**
 * `LOG_003` Ordering — use the clues to put four items in order.
 *
 * A *build* interaction rather than a *choose* one: the answer accumulates under
 * your finger. Every clue is load-bearing — drop any one and the answer stops
 * being unique — which the validator proves by enumeration.
 */
export function OrderingEngine({ puzzle, revealed, onAnswer }: EngineProps<OrderingPuzzle>) {
  const elapsed = useElapsed();

  return (
    <PuzzleFrame category="logic" engine={puzzle.engine} prompt={puzzle.prompt}>
      <View style={styles.body}>
        <View style={styles.clues}>
          {puzzle.clues.map((clue, i) => (
            <View key={i} style={styles.clueRow}>
              <Text style={styles.bullet}>{i + 1}</Text>
              <Text style={styles.clueText}>{clue}</Text>
            </View>
          ))}
        </View>

        <OrderingInput
          items={puzzle.items}
          correctOrder={puzzle.correctOrder}
          revealed={revealed}
          accent={ACCENT}
          hint="Tap the items from first to last."
          onComplete={(orderedIds) =>
            onAnswer({ kind: 'sequence', selectedIds: orderedIds, elapsedMs: elapsed() })
          }
        />
      </View>
    </PuzzleFrame>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  clues: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
  },
  clueRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  bullet: { ...typography.label, letterSpacing: 0, width: 12, color: ACCENT, lineHeight: 22 },
  clueText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 22 },
});
