import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnimatedMount } from '../components/AnimatedMount';
import { BrewMark, Wordmark } from '../components/brand/BrewMark';
import { CategoryMark } from '../components/brand/CategoryMark';
import { Button } from '../components/Button';
import { RankComparison } from '../components/RankComparison';
import { Screen } from '../components/Screen';
import { ShareSheet } from '../components/ShareSheet';
import { StreakSummary } from '../components/StreakSummary';
import { verdictOf } from '../components/verdict';
import type { MyRankSummaryView } from '../cloud/useLeaderboard';
import type { ProgressSummaryView } from '../cloud/useProgress';
import { buildShareSnapshot, type ShareSessionType } from '../cloud/shareSnapshot';
import { brewScoreCaption, MAX_BREW_SCORE, MAX_POINTS_PER_PUZZLE } from '../scoring/brewScore';
import {
  duration,
  easing,
  STAGGER_MS,
  USE_NATIVE_DRIVER,
  useReducedMotion,
} from '../theme/motion';
import { colors, radius, shadow, spacing, typography } from '../theme/theme';
import { CATEGORY_LABELS, type BrewScore } from '../types/puzzle';

interface ResultsScreenProps {
  score: BrewScore;
  onPlayAgain: () => void;
  onHome: () => void;
  /** True while a new attempt is being started (Replay), to prevent double taps. */
  busy?: boolean;
  /** True when this was the player's ranked brew for the day (cloud only). */
  ranked?: boolean;
  /** The daily rank summary (cloud + ranked only). Loads independently of the score. */
  rankSummary?: MyRankSummaryView;
  onViewLeaderboards?: () => void;
  /** The streak/progress summary (cloud + ranked only). Loads independently of the score. */
  progressSummary?: ProgressSummaryView;
  onViewProgress?: () => void;
  /** ranked | practice | local — drives the Share Card label and the replay copy. */
  sessionType?: ShareSessionType;
  /** UTC date this result belongs to (for the share card). */
  shareDate?: string;
  /** Current ranked streak, for a ranked share card only. */
  streak?: number | null;
  /** Ranked-only: the score was corrected by a puzzle-void recalculation. */
  updatedAfterValidation?: boolean;
}

/** Scores at or above this earn the single gold beat. Nothing else uses gold. */
const CELEBRATION_THRESHOLD = 85;

export function ResultsScreen({
  score, onPlayAgain, onHome, busy = false, ranked = false, rankSummary, onViewLeaderboards,
  progressSummary, onViewProgress, sessionType, shareDate, streak, updatedAfterValidation,
}: ResultsScreenProps) {
  const reduced = useReducedMotion();
  const displayed = useCountUp(score.total, reduced);
  const celebrate = score.total >= CELEBRATION_THRESHOLD;
  const showRank = ranked && rankSummary && onViewLeaderboards;
  const showStreak = ranked && progressSummary && onViewProgress;
  const [shareOpen, setShareOpen] = useState(false);

  // The session type of THIS result (ranked / practice / local). Practice is the
  // default for a non-ranked cloud brew; local mode is its own label.
  const resolvedType: ShareSessionType = sessionType ?? (ranked ? 'ranked' : 'practice');
  const replayLabel = resolvedType === 'ranked' ? 'Practice Brew' : 'Play another Practice Brew';

  // A FROZEN snapshot for this result — generated_at is captured once so an
  // exported card is an immutable historical copy (a later void recalc won't
  // change it; the app's live score stays authoritative elsewhere).
  const generatedAt = useRef(new Date().toISOString()).current;
  const snapshot = useMemo(() => buildShareSnapshot({
    nowIso: generatedAt,
    sessionType: resolvedType,
    date: shareDate ?? generatedAt.slice(0, 10),
    score,
    caption: brewScoreCaption(score.total),
    streak: resolvedType === 'ranked' ? (streak ?? null) : null,
    updatedAfterValidation: resolvedType === 'ranked' ? updatedAfterValidation === true : false,
    username: null, // omitted by default (Task 14) — no privacy setup screen needed
  }), [generatedAt, resolvedType, shareDate, score, streak, updatedAfterValidation]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AnimatedMount distance={0}>
          <View style={styles.brandRow}>
            <BrewMark size={20} />
            <Wordmark size={16} />
            {/*
              Ranked results carry a quiet "Ranked" badge; everything else is an
              unranked practice/guest brew. Neither shows a rank, percentile, or
              competitor — Phase 6A is a single secure result, not a leaderboard.
            */}
            {ranked ? (
              <View style={styles.rankedTag}>
                <Text style={styles.rankedTagText}>Ranked</Text>
              </View>
            ) : (
              <View style={styles.guestTag}>
                <Text style={styles.guestTagText}>Practice · Unranked</Text>
              </View>
            )}
          </View>
        </AnimatedMount>

        <AnimatedMount distance={12}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>YOUR BREWSCORE</Text>

            <View style={styles.scoreWrap}>
              {celebrate && <CelebrationRing />}
              <View style={styles.scoreRow}>
                <Text style={styles.score}>{displayed}</Text>
                <Text style={styles.scoreMax}>/ {MAX_BREW_SCORE}</Text>
              </View>
            </View>

            {/*
              The caption describes the final score, so it must not appear until
              the counter has actually reached it — otherwise "A perfect brew."
              sits above a number still counting through 87.
            */}
            <AnimatedMount delay={duration.count} distance={6} style={styles.captionWrap}>
              <Text style={[styles.caption, celebrate && styles.captionGold]}>
                {brewScoreCaption(score.total)}
              </Text>
              <Text style={styles.meta}>{formatDuration(score.totalElapsedMs)} of solving</Text>
            </AnimatedMount>
          </View>
        </AnimatedMount>

        <View style={styles.breakdown}>
          {score.results.map((result, i) => {
            const verdict = verdictOf(result);
            return (
              <AnimatedMount
                key={result.puzzleId}
                delay={140 + i * STAGGER_MS}
                distance={10}
              >
                <View style={styles.row}>
                  <Text style={[styles.mark, { color: verdict.color }]}>{verdict.mark}</Text>

                  <CategoryMark category={result.category} size={15} />

                  <View style={styles.rowText}>
                    <Text style={styles.category}>{CATEGORY_LABELS[result.category]}</Text>
                    <Text style={styles.detail}>
                      {result.accuracyPoints} accuracy · {result.speedPoints} speed
                    </Text>
                  </View>

                  <Text style={styles.rowPoints}>
                    {result.points}
                    <Text style={styles.rowPointsMax}> / {MAX_POINTS_PER_PUZZLE}</Text>
                  </Text>
                </View>
              </AnimatedMount>
            );
          })}
        </View>

        {showStreak && (
          <AnimatedMount delay={140 + 5 * STAGGER_MS} distance={10}>
            <StreakSummary view={progressSummary!} onViewProgress={onViewProgress!} context="results" />
          </AnimatedMount>
        )}

        {showRank && (
          <AnimatedMount delay={140 + 5.5 * STAGGER_MS} distance={10}>
            <RankComparison view={rankSummary!} onViewLeaderboards={onViewLeaderboards!} />
          </AnimatedMount>
        )}

        <AnimatedMount delay={140 + 6 * STAGGER_MS} distance={10}>
          <View style={styles.footer}>
            <Button label="Share Result" onPress={() => setShareOpen(true)} disabled={busy} />

            <Text style={styles.tomorrow}>
              {resolvedType === 'ranked' ? 'A new brew is poured at 00:00 UTC.' : 'Practice never affects your ranked score or streak.'}
            </Text>

            <Button label={replayLabel} variant={resolvedType === 'ranked' ? 'secondary' : 'primary'} onPress={onPlayAgain} disabled={busy} />
            {resolvedType !== 'ranked' && onViewProgress && (
              <Button label="View Practice Progress" variant="secondary" onPress={onViewProgress} disabled={busy} />
            )}
            <Button label="Back to home" variant="secondary" onPress={onHome} disabled={busy} />
            <Text style={styles.disclaimer}>
              {resolvedType === 'ranked'
                ? 'Replays start a fresh unranked Practice Brew on today’s pack.'
                : 'Practice Brews are unranked and never enter leaderboards or streaks.'}
            </Text>
          </View>
        </AnimatedMount>
      </ScrollView>

      <ShareSheet snapshot={snapshot} visible={shareOpen} onClose={() => setShareOpen(false)} />
    </Screen>
  );
}

/**
 * Counts 0 → total once. Under reduced motion the final number is rendered
 * immediately rather than counted quickly.
 */
function useCountUp(total: number, reduced: boolean): number {
  const [displayed, setDisplayed] = useState(reduced ? total : 0);
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      setDisplayed(total);
      return;
    }
    const id = value.addListener(({ value: v }) => setDisplayed(Math.round(v)));
    const animation = Animated.timing(value, {
      toValue: total,
      duration: duration.count,
      easing: easing.out,
      // Drives a JS number, so it cannot run on the native thread.
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
      value.removeListener(id);
    };
  }, [reduced, total, value]);

  return displayed;
}

/** One gold pulse behind the score. Fires once, never flashes, never repeats. */
function CelebrationRing() {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    const animation = Animated.sequence([
      Animated.delay(duration.count * 0.7),
      Animated.timing(pulse, {
        toValue: 1,
        duration: duration.celebrate,
        easing: easing.out,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [pulse, reduced]);

  if (reduced) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          opacity: pulse.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0.55, 0] }),
          transform: [
            { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.35] }) },
          ],
        },
      ]}
    />
  );
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  guestTag: {
    marginLeft: 'auto',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guestTagText: { ...typography.label, fontSize: 10, color: colors.textFaint },
  rankedTag: {
    marginLeft: 'auto',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.mint,
    backgroundColor: colors.surface,
  },
  rankedTagText: { ...typography.label, fontSize: 10, color: colors.mint },

  hero: { alignItems: 'center', paddingTop: spacing.sm },
  eyebrow: { ...typography.label, color: colors.mint },
  scoreWrap: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  ring: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 2,
    borderColor: colors.gold,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline' },
  score: { ...typography.score, color: colors.text, lineHeight: 84 },
  scoreMax: { ...typography.heading, color: colors.textFaint, marginLeft: spacing.sm },
  captionWrap: { alignItems: 'center', marginTop: spacing.md },
  caption: { ...typography.title, fontSize: 22, color: colors.violet },
  captionGold: { color: colors.gold },
  meta: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

  breakdown: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  mark: { fontSize: 17, fontWeight: '700', width: 16, textAlign: 'center' },
  rowText: { flex: 1 },
  category: { ...typography.option, fontWeight: '600', color: colors.text },
  detail: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  rowPoints: { fontSize: 18, fontWeight: '700', color: colors.text },
  rowPointsMax: { fontSize: 12, fontWeight: '400', color: colors.textFaint },

  footer: { gap: spacing.md },
  tomorrow: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  disclaimer: { fontSize: 12, color: colors.textFaint, textAlign: 'center', lineHeight: 18 },
});
