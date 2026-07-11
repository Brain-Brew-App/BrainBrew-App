import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Figure } from '../components/Figure';
import { OptionTiles } from '../components/OptionTiles';
import { PuzzleFrame } from '../components/PuzzleFrame';
import { useElapsed } from '../hooks/useElapsed';
import { CATEGORY_ACCENTS, colors, radius, spacing, typography } from '../theme/theme';
import type { MatrixCompletionPuzzle } from '../types/puzzle';
import type { EngineProps } from './types';

const ACCENT = CATEGORY_ACCENTS.pattern;

/**
 * `PAT_002` Matrix Completion — the Raven's-matrix lineage.
 *
 * Nine cells; the bottom-right is blank. Each row and column obeys a rule over
 * shape, count and fill — all geometric attributes, never colour (§13). Each
 * distractor violates exactly one attribute, so none is dismissible at a glance.
 */
export function MatrixCompletionEngine({
  puzzle,
  revealed,
  onAnswer,
}: EngineProps<MatrixCompletionPuzzle>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const elapsed = useElapsed();

  const handleSelect = (optionId: string) => {
    if (revealed) return;
    setSelectedId(optionId);
    onAnswer({ kind: 'choice', selectedId: optionId, elapsedMs: elapsed() });
  };

  return (
    <PuzzleFrame category="pattern" engine={puzzle.engine} prompt={puzzle.prompt}>
      <View style={styles.matrix}>
        {puzzle.cells.map((figure, i) => (
          <View key={i} style={[styles.cell, !figure && styles.blank]}>
            {figure ? <Figure figure={figure} size={14} /> : <Text style={styles.q}>?</Text>}
          </View>
        ))}
      </View>

      <OptionTiles
        accent={ACCENT}
        columns={2}
        revealed={revealed}
        selectedId={selectedId}
        correctOptionId={puzzle.correctOptionId}
        onSelect={handleSelect}
        options={puzzle.options.map((option) => ({
          id: option.id,
          label: option.label,
          node: <Figure figure={puzzle.optionFigures[option.id]!} size={16} />,
        }))}
      />
    </PuzzleFrame>
  );
}

const styles = StyleSheet.create({
  matrix: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
    marginBottom: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    padding: spacing.xs,
  },
  cell: {
    width: 84,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  blank: { borderWidth: 1, borderStyle: 'dashed', borderColor: ACCENT, backgroundColor: 'transparent' },
  q: { ...typography.heading, color: ACCENT },
});
