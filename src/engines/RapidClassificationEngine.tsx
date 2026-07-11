import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PuzzleFrame } from '../components/PuzzleFrame';
import { TaskBrief, TimerChip } from '../components/TaskBrief';
import { useTimedTask } from '../hooks/useTimedTask';
import { usePressScale } from '../theme/motion';
import { CATEGORY_ACCENTS, colors, radius, spacing, typography } from '../theme/theme';
import type { RapidClassificationPuzzle } from '../types/puzzle';
import type { EngineProps } from './types';

const ACCENT = CATEGORY_ACCENTS['attention-speed'];
/** Comfortably above the 48dp floor: these are the only two targets on screen. */
const BUTTON_HEIGHT = 68;

/**
 * `ATT_003` Rapid Classification — sort each symbol into one of two groups.
 *
 * A steady beat of small decisions rather than one long scan. Multi-second, so
 * latency noise is a negligible fraction of the signal (§3) — and the rule is
 * restated on the buttons themselves, so nothing must be memorised.
 *
 * Scoring is accuracy × coverage: classifying eight carefully beats rushing
 * twelve. Guessing fast is arithmetically worse than answering carefully.
 */
export function RapidClassificationEngine({
  puzzle,
  revealed,
  onAnswer,
}: EngineProps<RapidClassificationPuzzle>) {
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);

  const total = puzzle.items.length;
  const submitted = useRef(false);
  // Mirrors, so the countdown's expiry callback never reads stale state.
  const progress = useRef({ index: 0, correct: 0 });
  progress.current = { index, correct };
  // Raw per-item choices, for server-authoritative scoring in cloud mode.
  const choices = useRef<{ itemId: string; bucket: 0 | 1 }[]>([]);

  const submit = useCallback(
    (elapsedMs: number) => {
      if (submitted.current) return;
      submitted.current = true;
      onAnswer({
        kind: 'classify',
        correct: progress.current.correct,
        attempted: progress.current.index,
        total,
        classifications: [...choices.current],
        elapsedMs: Math.min(elapsedMs, puzzle.durationMs),
      });
    },
    [onAnswer, puzzle.durationMs, total],
  );

  const { phase, remainingMs, begin, elapsed } = useTimedTask(puzzle.durationMs, revealed, () =>
    submit(puzzle.durationMs),
  );

  const item = puzzle.items[index];

  const classify = (bucket: 0 | 1) => {
    if (phase !== 'playing' || revealed || submitted.current || !item) return;

    const nextIndex = index + 1;
    // `item.bucket` is the private key: present locally, absent in cloud. The raw
    // choice is always recorded; the local `correct` tally only advances when the
    // key is present (cloud scoring happens on the server from `classifications`).
    const nextCorrect = correct + (item.bucket === bucket ? 1 : 0);
    choices.current = [...choices.current, { itemId: item.id, bucket }];
    progress.current = { index: nextIndex, correct: nextCorrect };
    setIndex(nextIndex);
    setCorrect(nextCorrect);

    if (nextIndex >= total) submit(elapsed());
  };

  return (
    <PuzzleFrame
      category="attention-speed"
      engine={puzzle.engine}
      prompt={puzzle.prompt}
      accessory={
        phase === 'playing' ? (
          <TimerChip seconds={Math.ceil(remainingMs / 1000)} accent={ACCENT} />
        ) : undefined
      }
    >
      {phase === 'ready' ? (
        <TaskBrief
          accent={ACCENT}
          label="THE RULE"
          focus={<Text style={styles.rule}>{puzzle.rule}</Text>}
          hint={`Sort each symbol: ${puzzle.buckets[0]} or ${puzzle.buckets[1]}. ${total} in total.`}
          onBegin={begin}
        />
      ) : (
        <View style={styles.play}>
          <Text style={styles.counter}>
            {Math.min(index + 1, total)} OF {total}
          </Text>

          <View style={styles.stage}>
            {item ? (
              <Text style={styles.glyph}>{item.glyph}</Text>
            ) : (
              <Text style={styles.done}>All sorted</Text>
            )}
          </View>

          <Text style={styles.ruleSmall}>{puzzle.rule}</Text>

          <View style={styles.buttons}>
            {puzzle.buckets.map((label, bucket) => (
              <BucketButton
                key={label}
                label={label}
                disabled={revealed || !item}
                onPress={() => classify(bucket as 0 | 1)}
              />
            ))}
          </View>
        </View>
      )}
    </PuzzleFrame>
  );
}

/** Half-width, symmetric — left/right-handed neutral by construction (§13). */
function BucketButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale(0.97);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [styles.bucket, pressed && styles.bucketPressed, disabled && styles.bucketDisabled]}
    >
      <Text style={styles.bucketLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rule: { ...typography.heading, color: colors.text, textAlign: 'center' },
  play: { gap: spacing.lg },
  counter: { ...typography.label, color: colors.textMuted, textAlign: 'center' },
  stage: {
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
  },
  glyph: { fontSize: 72, lineHeight: 84, color: colors.text },
  done: { ...typography.body, color: colors.textMuted },
  ruleSmall: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  bucket: {
    flex: 1,
    minHeight: BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    backgroundColor: colors.surfaceRaised,
  },
  bucketPressed: { backgroundColor: colors.floating, borderColor: ACCENT },
  bucketDisabled: { opacity: 0.4 },
  bucketLabel: { ...typography.option, fontWeight: '700', color: colors.text, textAlign: 'center' },
});
