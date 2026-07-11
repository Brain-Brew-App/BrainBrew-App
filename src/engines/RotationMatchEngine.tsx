import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OptionTiles } from '../components/OptionTiles';
import { PuzzleFrame } from '../components/PuzzleFrame';
import { ShapeMatrix } from '../components/ShapeMatrix';
import { useElapsed } from '../hooks/useElapsed';
import { CATEGORY_ACCENTS, colors, radius, spacing, typography } from '../theme/theme';
import type { RotationMatchPuzzle } from '../types/puzzle';
import type { EngineProps } from './types';

const ACCENT = CATEGORY_ACCENTS.observation;

/**
 * `OBS_003` Rotation Match — which candidate is the target, rotated?
 *
 * The distractors are typed, not random: one is the target *mirrored* (it looks
 * right and isn't), one has a single cell moved, one is a different shape.
 * Every candidate has the same number of filled cells, so counting reveals
 * nothing (Catalog §OBS_003).
 *
 * Shapes are cell matrices rendered as Views, never font glyphs — the one
 * engine in the catalog immune to the cross-platform glyph risk.
 */
export function RotationMatchEngine({
  puzzle,
  revealed,
  onAnswer,
}: EngineProps<RotationMatchPuzzle>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const elapsed = useElapsed();

  const handleSelect = (optionId: string) => {
    if (revealed) return;
    setSelectedId(optionId);
    onAnswer({ kind: 'choice', selectedId: optionId, elapsedMs: elapsed() });
  };

  return (
    <PuzzleFrame category="observation" engine={puzzle.engine} prompt={puzzle.prompt}>
      <View style={styles.targetCard}>
        <Text style={styles.label}>THIS SHAPE</Text>
        <ShapeMatrix cells={puzzle.target} size={92} />
      </View>

      <OptionTiles
        accent={ACCENT}
        columns={2}
        revealed={revealed}
        selectedId={selectedId}
        correctOptionId={puzzle.correctOptionId}
        onSelect={handleSelect}
        options={puzzle.options.map((option, i) => ({
          id: option.id,
          label: `Shape ${i + 1}`,
          node: <ShapeMatrix cells={option.cells} size={76} />,
        }))}
      />
    </PuzzleFrame>
  );
}

const styles = StyleSheet.create({
  targetCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
  },
  label: { ...typography.label, color: ACCENT },
});
