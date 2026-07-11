import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { GlyphTile, type TileState } from '../components/GlyphTile';
import { Grid } from '../components/Grid';
import { PuzzleFrame } from '../components/PuzzleFrame';
import { TaskBrief } from '../components/TaskBrief';
import { useFlashSequence } from '../hooks/useFlashSequence';
import { CATEGORY_ACCENTS, colors, radius, shadow, spacing, typography } from '../theme/theme';
import type { MemoryFlashPuzzle } from '../types/puzzle';
import type { EngineProps } from './types';

const ACCENT = CATEGORY_ACCENTS['attention-speed'];

/**
 * `ATT_002` Memory Flash — a short exposure, a neutral pause, then find what you
 * saw.
 *
 * The only engine that tests *holding* rather than *finding*.
 *
 * **The pause is not a flash.** The stage below is one container that persists
 * across exposure, pause and selection; the pause simply empties it. There is no
 * frame swap and therefore no luminance step — the §13 requirement is structural
 * here, not something a future edit can forget.
 *
 * Nothing is timed until the board appears: the clock starts on selection, since
 * the player cannot act during the exposure or the pause.
 */
export function MemoryFlashEngine({ puzzle, revealed, onAnswer }: EngineProps<MemoryFlashPuzzle>) {
  const [picked, setPicked] = useState<string[]>([]);
  const submitted = useRef(false);
  const { phase, begin, elapsed } = useFlashSequence(puzzle.exposureMs, puzzle.intervalMs, revealed);

  const submit = () => {
    if (submitted.current || revealed) return;
    submitted.current = true;
    onAnswer({ kind: 'sequence', selectedIds: picked, elapsedMs: elapsed() });
  };

  const toggle = (tileId: string) => {
    if (revealed || submitted.current) return;
    if (picked.includes(tileId)) setPicked(picked.filter((id) => id !== tileId));
    else if (picked.length < puzzle.targets.length) setPicked([...picked, tileId]);
  };

  const stateOf = (tileId: string): TileState => {
    const isTarget = puzzle.targetIds.includes(tileId);
    const isPicked = picked.includes(tileId);
    if (!revealed) return isPicked ? 'selected' : 'idle';
    if (isTarget && isPicked) return 'correct';
    if (isTarget) return 'missed';
    if (isPicked) return 'wrong';
    return 'idle';
  };

  const seconds = (puzzle.exposureMs / 1000).toFixed(puzzle.exposureMs % 1000 ? 1 : 0);

  return (
    <PuzzleFrame category="attention-speed" engine={puzzle.engine} prompt={puzzle.prompt}>
      {phase === 'ready' ? (
        <TaskBrief
          accent={ACCENT}
          label="REMEMBER THESE"
          focus={<Text style={styles.count}>{puzzle.targets.length}</Text>}
          hint={
            puzzle.orderMatters
              ? `${puzzle.targets.length} symbols for ${seconds} seconds. Tap them back in the same order.`
              : `${puzzle.targets.length} symbols for ${seconds} seconds. Then find them again.`
          }
          onBegin={begin}
        />
      ) : (
        <View style={styles.body}>
          {/*
            One stage, three phases. The container never changes size, colour or
            elevation — only its contents. That is what makes the pause neutral.
          */}
          <View style={styles.stage}>
            {phase === 'exposure' && (
              <View style={styles.targets}>
                {puzzle.targets.map((glyph, i) => (
                  <Text key={i} style={styles.targetGlyph}>
                    {glyph}
                  </Text>
                ))}
              </View>
            )}
            {phase === 'interval' && <View />}
            {phase === 'select' && (
              <Text style={styles.prompt}>
                {picked.length} of {puzzle.targets.length} chosen
                {puzzle.orderMatters ? ' · order matters' : ''}
              </Text>
            )}
          </View>

          {phase === 'select' && (
            <>
              <Grid columns={puzzle.columns}>
                {puzzle.board.map((tile) => (
                  <GlyphTile
                    key={tile.id}
                    glyph={tile.glyph}
                    glyphSize={26}
                    accent={ACCENT}
                    state={stateOf(tile.id)}
                    disabled={revealed}
                    onPress={() => toggle(tile.id)}
                  />
                ))}
              </Grid>

              {!revealed && (
                <Button
                  label={picked.length === puzzle.targets.length ? 'Submit' : `Submit ${picked.length} of ${puzzle.targets.length}`}
                  onPress={submit}
                  disabled={picked.length === 0}
                />
              )}
            </>
          )}
        </View>
      )}
    </PuzzleFrame>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  count: { fontSize: 52, fontWeight: '800', color: colors.text, lineHeight: 60 },
  stage: {
    minHeight: 108,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    ...shadow.card,
  },
  targets: { flexDirection: 'row', gap: spacing.md },
  targetGlyph: { fontSize: 42, lineHeight: 52, color: colors.text },
  prompt: { ...typography.label, color: colors.textMuted },
});
