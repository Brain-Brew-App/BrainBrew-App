import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PuzzleFrame } from '../components/PuzzleFrame';
import { SequenceChips, type ChipState } from '../components/SequenceChips';
import { useElapsed } from '../hooks/useElapsed';
import { colors, spacing, typography } from '../theme/theme';
import type { SequenceRepairPuzzle } from '../types/puzzle';
import { useHasAnswerKey } from './revealContext';
import type { EngineProps } from './types';

/**
 * `PAT_003` Sequence Repair — one term is wrong; tap it.
 *
 * Flips Sequence Completion from extrapolation to *verification*, which is a
 * different mental act. There are no options: the sequence is the answer space,
 * so every chip is a 48dp tap target.
 */
export function SequenceRepairEngine({ puzzle, revealed, onAnswer }: EngineProps<SequenceRepairPuzzle>) {
  const [selected, setSelected] = useState<number | null>(null);
  const elapsed = useElapsed();
  // Cloud mode has no wrongIndex/correctTerm: freeze on the player's pick and let
  // the RevealCard carry the verdict.
  const hasKey = useHasAnswerKey();

  const handleTap = (index: number) => {
    if (revealed) return;
    setSelected(index);
    onAnswer({ kind: 'choice', selectedId: `term-${index}`, elapsedMs: elapsed() });
  };

  const stateOf = (i: number): ChipState => {
    if (!revealed || !hasKey) return i === selected ? 'selected' : 'idle';
    if (i === puzzle.wrongIndex) return 'correct';
    if (i === selected) return 'wrong';
    return 'idle';
  };

  return (
    <PuzzleFrame category="pattern" engine={puzzle.engine} prompt={puzzle.prompt}>
      <View style={styles.body}>
        <SequenceChips terms={puzzle.terms} onTapTerm={handleTap} stateOf={stateOf} />
        <Text style={styles.hint}>
          {revealed && hasKey ? `It should have been ${puzzle.correctTerm}.` : 'Every other term follows the rule.'}
        </Text>
      </View>
    </PuzzleFrame>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  hint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});
