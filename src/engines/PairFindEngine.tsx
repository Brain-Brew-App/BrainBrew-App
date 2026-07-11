import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { GlyphTile, type TileState } from '../components/GlyphTile';
import { Grid } from '../components/Grid';
import { PuzzleFrame } from '../components/PuzzleFrame';
import { useElapsed } from '../hooks/useElapsed';
import { CATEGORY_ACCENTS, colors, spacing, typography } from '../theme/theme';
import type { PairFindPuzzle } from '../types/puzzle';
import type { EngineProps } from './types';

const ACCENT = CATEGORY_ACCENTS.observation;

/**
 * `OBS_004` Pair Find — exactly two tiles match; tap them both.
 *
 * Inverts Odd One Out: you cannot solve it by spotting an anomaly, you must
 * build a mental index. The first tap is **reversible** — an un-undoable misfire
 * would cost the whole puzzle unfairly.
 */
export function PairFindEngine({ puzzle, revealed, onAnswer }: EngineProps<PairFindPuzzle>) {
  const [selected, setSelected] = useState<string[]>([]);
  const elapsed = useElapsed();

  const handleTap = (tileId: string) => {
    if (revealed) return;

    if (selected.includes(tileId)) {
      setSelected(selected.filter((id) => id !== tileId));
      return;
    }

    const next = [...selected, tileId];
    setSelected(next);
    if (next.length === 2) onAnswer({ kind: 'sequence', selectedIds: next, elapsedMs: elapsed() });
  };

  const stateOf = (tileId: string): TileState => {
    const isPair = puzzle.pairTileIds.includes(tileId);
    const isSelected = selected.includes(tileId);
    if (!revealed) return isSelected ? 'selected' : 'idle';
    if (isPair) return 'correct';
    if (isSelected) return 'wrong';
    return 'idle';
  };

  return (
    <PuzzleFrame category="observation" engine={puzzle.engine} prompt={puzzle.prompt}>
      <Text style={styles.counter}>
        {selected.length} OF 2 SELECTED
        {selected.length > 0 && !revealed && <Text style={styles.hint}>{'   '}TAP AGAIN TO UNDO</Text>}
      </Text>

      <Grid columns={puzzle.columns}>
        {puzzle.tiles.map((tile) => (
          <GlyphTile
            key={tile.id}
            glyph={tile.glyph}
            glyphSize={28}
            accent={ACCENT}
            state={stateOf(tile.id)}
            disabled={revealed}
            onPress={() => handleTap(tile.id)}
          />
        ))}
      </Grid>
    </PuzzleFrame>
  );
}

const styles = StyleSheet.create({
  counter: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  hint: { ...typography.label, color: colors.textFaint },
});
