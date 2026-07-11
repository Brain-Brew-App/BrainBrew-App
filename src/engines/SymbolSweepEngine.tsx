import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { GlyphTile, type TileState } from '../components/GlyphTile';
import { Grid } from '../components/Grid';
import { PuzzleFrame } from '../components/PuzzleFrame';
import { TaskBrief, TimerChip } from '../components/TaskBrief';
import { useTimedTask } from '../hooks/useTimedTask';
import { CATEGORY_ACCENTS, colors, spacing, typography } from '../theme/theme';
import type { SweepSymbol, SymbolSweepPuzzle } from '../types/puzzle';
import { AnswerKeyProvider } from './revealContext';
import type { EngineProps } from './types';

const ACCENT = CATEGORY_ACCENTS['attention-speed'];

/**
 * `ATT_001` Symbol Sweep.
 *
 * A several-second sustained-attention task, deliberately not a millisecond
 * reflex test (§3): tap every target, ignore distractors. Gated behind Begin,
 * so reading the brief costs nothing. Submits itself when every target is found
 * or the window closes, whichever lands first.
 */
export function SymbolSweepEngine({ puzzle, revealed, onAnswer }: EngineProps<SymbolSweepPuzzle>) {
  const [tapped, setTapped] = useState<string[]>([]);

  // A target is a tile whose glyph is the target glyph. That is PUBLIC data (the
  // player can see it), so this works identically in local and cloud mode —
  // Symbol Sweep never needs the private `isTarget` field, and its live/reveal
  // feedback is not an answer leak.
  const isTargetOf = (s: SweepSymbol): boolean => s.isTarget ?? s.glyph === puzzle.targetGlyph;
  const totalTargets = puzzle.symbols.filter(isTargetOf).length;

  // Mirror of state for the timer's callback, which would otherwise close over
  // a stale `tapped` between ticks.
  const tappedRef = useRef(tapped);
  tappedRef.current = tapped;
  const submitted = useRef(false);

  const submit = useCallback(
    (elapsedMs: number) => {
      if (submitted.current) return;
      submitted.current = true;

      const targetIds = new Set(puzzle.symbols.filter(isTargetOf).map((s) => s.id));
      const hits = tappedRef.current.filter((id) => targetIds.has(id)).length;

      onAnswer({
        kind: 'sweep',
        hits,
        falsePositives: tappedRef.current.length - hits,
        totalTargets,
        // Raw taps for server-authoritative scoring in cloud mode.
        tappedIds: [...tappedRef.current],
        elapsedMs: Math.min(elapsedMs, puzzle.durationMs),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onAnswer, puzzle.durationMs, puzzle.symbols, totalTargets],
  );

  const { phase, remainingMs, begin, elapsed } = useTimedTask(puzzle.durationMs, revealed, () =>
    submit(puzzle.durationMs),
  );

  const handleTap = (symbolId: string, isTarget: boolean) => {
    if (phase !== 'playing' || revealed || submitted.current || tapped.includes(symbolId)) return;

    const next = [...tapped, symbolId];
    tappedRef.current = next;
    setTapped(next);

    const targetIds = new Set(puzzle.symbols.filter(isTargetOf).map((s) => s.id));
    const hits = next.filter((id) => targetIds.has(id)).length;
    if (isTarget && hits === totalTargets) submit(elapsed());
  };

  const found = tapped.filter((id) => {
    const s = puzzle.symbols.find((sym) => sym.id === id);
    return s ? isTargetOf(s) : false;
  }).length;
  const wrongTaps = tapped.length - found;
  const distractors = [...new Set(puzzle.symbols.filter((s) => !isTargetOf(s)).map((s) => s.glyph))];

  const stateOf = (symbolId: string, isTarget: boolean): TileState => {
    const isTapped = tapped.includes(symbolId);
    if (isTapped && isTarget) return 'correct';
    if (isTapped) return 'wrong';
    if (revealed && isTarget) return 'missed';
    return 'idle';
  };

  return (
    <PuzzleFrame
      category="attention-speed"
      engine={puzzle.engine}
      prompt={puzzle.prompt}
      accessory={phase === 'playing' ? <TimerChip seconds={Math.ceil(remainingMs / 1000)} accent={ACCENT} /> : undefined}
    >
      {phase === 'ready' ? (
        <TaskBrief
          accent={ACCENT}
          label="YOUR TARGET"
          focus={<Text style={styles.targetGlyph}>{puzzle.targetGlyph}</Text>}
          hint={`Tap all ${totalTargets}. Ignore ${distractors.join(' and ')}.`}
          onBegin={begin}
        />
      ) : (
        <>
          {/* Wrong taps are shown as they happen — "7 of 7 found" alongside a
              silent penalty made the score look broken at the reveal. */}
          <Text style={styles.counter}>
            {found} OF {totalTargets} FOUND
            {wrongTaps > 0 && (
              <Text style={styles.wrongTaps}>
                {'   '}
                {wrongTaps} WRONG {wrongTaps === 1 ? 'TAP' : 'TAPS'}
              </Text>
            )}
          </Text>

          {/* Targets are determined from public glyph data, so correctness here is
              not an answer leak — opt back into the rich reveal even in cloud. */}
          <AnswerKeyProvider value={true}>
            <Grid columns={puzzle.columns}>
              {puzzle.symbols.map((symbol) => (
                <GlyphTile
                  key={symbol.id}
                  glyph={symbol.glyph}
                  glyphSize={26}
                  elevated={false}
                  state={stateOf(symbol.id, isTargetOf(symbol))}
                  disabled={revealed || tapped.includes(symbol.id)}
                  onPress={() => handleTap(symbol.id, isTargetOf(symbol))}
                />
              ))}
            </Grid>
          </AnswerKeyProvider>
        </>
      )}
    </PuzzleFrame>
  );
}

const styles = StyleSheet.create({
  targetGlyph: { fontSize: 56, color: colors.text, lineHeight: 66 },
  counter: {
    ...typography.label,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  wrongTaps: { ...typography.label, color: colors.incorrect },
});
