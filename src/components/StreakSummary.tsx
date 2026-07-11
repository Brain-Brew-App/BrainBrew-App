import { StyleSheet, Text, View } from 'react-native';

import type { ProgressSummaryView } from '../cloud/useProgress';
import { streakMilestone } from '../cloud/validate';
import { Button } from './Button';
import { colors, radius, spacing, typography } from '../theme/theme';

interface StreakSummaryProps {
  view: ProgressSummaryView;
  onViewProgress: () => void;
  /** Results = always show (a ranked brew just completed); Home = only when a streak exists. */
  context: 'home' | 'results';
}

function dayLabel(streak: number): string {
  return streak === 1 ? '1-day ranked streak' : `${streak}-day ranked streak`;
}

/**
 * The compact streak/habit summary for Home and Results. Never blocks the screen
 * it lives on: while loading it shows a quiet skeleton; on failure it stays out
 * of the way (the score/Home are unaffected). Gold appears ONLY at a genuine
 * streak milestone — no fake fire, no childish gamification, no confetti.
 */
export function StreakSummary({ view, onViewProgress, context }: StreakSummaryProps) {
  const { phase, summary } = view;
  const hasData = summary && !summary.locked && summary.rankedDaysCompleted > 0;

  // Home stays clean when there's nothing to show yet; Results only mounts this
  // after a ranked completion, so there is always a streak there.
  if (!hasData) {
    if (context === 'home') return null;
    if (phase === 'loading') return <View style={styles.card}><View style={[styles.skeleton, { width: '50%' }]} /></View>;
    return null;
  }

  const milestone = streakMilestone(summary.currentStreak);
  const showBest = summary.bestStreak > summary.currentStreak && summary.bestStreak > 1;

  return (
    <View style={[styles.card, milestone != null && styles.cardMilestone]}>
      <View style={styles.lines}>
        <Text style={[styles.streak, milestone != null && styles.streakGold]}>
          {dayLabel(summary.currentStreak)}{milestone != null ? '  ·  milestone' : ''}
        </Text>
        <Text style={styles.meta}>
          {summary.todayCompleted ? 'Today’s ranked brew is complete.' : 'Play Today’s Ranked Brew to keep it going.'}
          {showBest ? `  ·  Best ${summary.bestStreak}` : ''}
        </Text>
      </View>
      <Button label="View Progress" variant={context === 'home' ? 'secondary' : 'primary'} onPress={onViewProgress} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
  },
  cardMilestone: { borderColor: colors.gold },
  lines: { gap: 2 },
  streak: { ...typography.title, fontSize: 20, color: colors.text },
  streakGold: { color: colors.gold },
  meta: { ...typography.caption, color: colors.textMuted },
  skeleton: { height: 18, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, opacity: 0.7 },
});
