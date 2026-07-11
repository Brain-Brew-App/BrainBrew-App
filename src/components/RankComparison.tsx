import { StyleSheet, Text, View } from 'react-native';

import { topPercent } from '../cloud/validate';
import type { MyRankSummaryView } from '../cloud/useLeaderboard';
import { Button } from './Button';
import { colors, radius, spacing, typography } from '../theme/theme';

interface RankComparisonProps {
  view: MyRankSummaryView;
  onViewLeaderboards: () => void;
  /** Compact = the Home variant (no button chrome; a single tap-through line). */
  compact?: boolean;
}

/**
 * The daily rank comparison shown on Results and Home. It NEVER blocks the score:
 * while the summary loads it shows a calm skeleton; on failure it offers a retry
 * for the comparison only (the BrewScore stays visible above it). No ranks,
 * percentiles, or competitor data are shown for practice/guest — the caller only
 * mounts this for a completed RANKED result.
 */
export function RankComparison({ view, onViewLeaderboards, compact = false }: RankComparisonProps) {
  const { phase, summary } = view;

  if (summary?.hasResult) {
    const pct = topPercent(summary.globalPosition, summary.globalTotal, summary.globalPercentile);
    const total = summary.globalTotal ?? 0;
    return (
      <View style={[styles.card, compact && styles.cardCompact]}>
        <View style={styles.lines}>
          <Text style={styles.primary}>#{summary.globalPosition?.toLocaleString()} globally</Text>
          {pct != null && <Text style={styles.accent}>Top {pct}%</Text>}
          {summary.countryPosition != null && summary.countryCode && (
            <Text style={styles.secondary}>#{summary.countryPosition.toLocaleString()} in {summary.countryCode}</Text>
          )}
          <Text style={styles.muted}>
            Among {total.toLocaleString()} ranked {total === 1 ? 'player' : 'players'} today
          </Text>
          {summary.updatedAfterValidation && (
            <Text style={styles.note}>Updated after a puzzle review.</Text>
          )}
        </View>
        <Button label="View Leaderboards" variant={compact ? 'secondary' : 'primary'} onPress={onViewLeaderboards} />
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={[styles.card, compact && styles.cardCompact]}>
        <Text style={styles.muted}>We couldn’t load your ranking. Your score is saved.</Text>
        <Button label="Retry" variant="secondary" onPress={view.retry} />
      </View>
    );
  }

  // Loading (or idle) — a quiet skeleton in the comparison area only.
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.lines}>
        <View style={[styles.skeleton, { width: '55%' }]} />
        <View style={[styles.skeleton, { width: '32%' }]} />
        <View style={[styles.skeleton, { width: '45%' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
  },
  cardCompact: { padding: spacing.md, gap: spacing.sm },
  lines: { gap: 2 },
  primary: { ...typography.title, fontSize: 22, color: colors.text },
  accent: { ...typography.heading, color: colors.mint },
  secondary: { ...typography.body, color: colors.text },
  muted: { ...typography.caption, color: colors.textMuted },
  note: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  skeleton: { height: 16, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, opacity: 0.7 },
});
