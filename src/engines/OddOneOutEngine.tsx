import { useState } from 'react';

import { GlyphTile, type TileState } from '../components/GlyphTile';
import { Grid } from '../components/Grid';
import { PuzzleFrame } from '../components/PuzzleFrame';
import { useElapsed } from '../hooks/useElapsed';
import type { OddOneOutPuzzle } from '../types/puzzle';
import type { EngineProps } from './types';

/** `OBS_001` Odd One Out — tap the tile that differs. */
export function OddOneOutEngine({ puzzle, revealed, onAnswer }: EngineProps<OddOneOutPuzzle>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const elapsed = useElapsed();

  const handlePress = (tileId: string) => {
    if (revealed) return;
    setSelectedId(tileId);
    onAnswer({ kind: 'choice', selectedId: tileId, elapsedMs: elapsed() });
  };

  const stateOf = (tileId: string): TileState => {
    if (!revealed) return 'idle';
    if (tileId === puzzle.oddTileId) return 'correct';
    if (tileId === selectedId) return 'wrong';
    return 'idle';
  };

  return (
    <PuzzleFrame category="observation" engine={puzzle.engine} prompt={puzzle.prompt}>
      <Grid columns={puzzle.columns}>
        {puzzle.tiles.map((tile) => (
          <GlyphTile
            key={tile.id}
            glyph={tile.glyph}
            glyphSize={30}
            state={stateOf(tile.id)}
            disabled={revealed}
            onPress={() => handlePress(tile.id)}
          />
        ))}
      </Grid>
    </PuzzleFrame>
  );
}
