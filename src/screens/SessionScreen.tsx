import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnimatedMount } from '../components/AnimatedMount';
import { BrewMark } from '../components/brand/BrewMark';
import { Button } from '../components/Button';
import { PuzzleProgress } from '../components/PuzzleProgress';
import { RevealCard } from '../components/RevealCard';
import { Screen } from '../components/Screen';
import { AnswerKeyProvider } from '../engines/revealContext';
import { renderEngine } from '../engines';
import { CATEGORY_ACCENTS, colors, spacing, typography } from '../theme/theme';
import type { Answer, CategoryResult, Puzzle } from '../types/puzzle';

interface SessionScreenProps {
  /** Local mode renders full puzzles (rich inline reveal); cloud renders render-safe ones. */
  hasAnswerKey: boolean;
  puzzle: Puzzle;
  /** 1-based slot index. */
  position: number;
  total: number;
  /** The server/local reveal, once submitted; null while playing/submitting. */
  outcome: { result: CategoryResult; explanation: string } | null;
  /** True while the answer is being scored (freezes the engine, disables Continue). */
  submitting: boolean;
  /**
   * True while the NEXT slot is being opened on the server.
   *
   * Continue used to stay lit and fully interactive for the whole ~0.4-1s the server
   * took to open the next puzzle, with the old reveal still on screen — so the tap
   * looked ignored. (A second tap was never a duplicate request; the in-flight guard
   * already collapsed it. This was purely a missing acknowledgement.) Disabling it
   * acknowledges the tap on the very next frame, without faking any progress.
   */
  advancing?: boolean;
  onAnswer: (answer: Answer) => void;
  onContinue: () => void;
}

/**
 * Plays one slot: engine → (submit) → reveal → continue. Mode-agnostic — it
 * renders whatever `Puzzle` the GameplayService hands it and shows whatever
 * result comes back. In cloud mode the answer key is absent, so the engine's
 * inline reveal is neutral (via AnswerKeyProvider) and the RevealCard — fed by
 * the SERVER result — carries the verdict.
 */
export function SessionScreen({
  hasAnswerKey,
  puzzle,
  position,
  total,
  outcome,
  submitting,
  advancing = false,
  onAnswer,
  onContinue,
}: SessionScreenProps) {
  const isLast = position >= total;
  // The engine is frozen the moment an answer is submitted, so no second answer
  // can be emitted while scoring is in flight.
  const revealed = outcome !== null || submitting;

  return (
    <Screen>
      <View style={styles.header}>
        <BrewMark size={22} />
        <View style={styles.progress}>
          <PuzzleProgress
            current={position - 1}
            total={total}
            accent={CATEGORY_ACCENTS[puzzle.category]}
          />
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <AnimatedMount key={puzzle.id} distance={14} style={styles.engine}>
          <AnswerKeyProvider value={hasAnswerKey}>
            {renderEngine({ puzzle, revealed, onAnswer })}
          </AnswerKeyProvider>
        </AnimatedMount>
      </ScrollView>

      {submitting && !outcome && (
        <View style={styles.scoring}>
          <ActivityIndicator color={colors.mint} accessibilityLabel="Loading" />
          <Text style={styles.scoringText}>Scoring…</Text>
        </View>
      )}

      {outcome && (
        <RevealCard key={`reveal-${puzzle.id}`} result={outcome.result} explanation={outcome.explanation}>
          <Button
            label={isLast ? 'See your BrewScore' : 'Continue'}
            onPress={onContinue}
            disabled={submitting || advancing}
          />
        </RevealCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  progress: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  engine: { flex: 1 },
  scoring: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  scoringText: { ...typography.caption, color: colors.textMuted },
});
