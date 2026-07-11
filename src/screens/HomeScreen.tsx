import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnimatedMount } from '../components/AnimatedMount';
import { BrewMark, Wordmark } from '../components/brand/BrewMark';
import { CategoryMark } from '../components/brand/CategoryMark';
import { Button } from '../components/Button';
import { RankComparison } from '../components/RankComparison';
import { Screen } from '../components/Screen';
import { StreakSummary } from '../components/StreakSummary';
import type { MyRankSummaryView } from '../cloud/useLeaderboard';
import type { ProgressSummaryView } from '../cloud/useProgress';
import { STAGGER_MS } from '../theme/motion';
import { CATEGORY_ACCENTS, colors, MIN_TAP_TARGET, radius, shadow, spacing, typography } from '../theme/theme';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../types/puzzle';

/** The player's ranked standing for today, as rendered on Home (cloud only). */
export interface HomeRankedStatus {
  eligible: boolean;
  state: 'none' | 'active' | 'completed' | 'expired';
  lockedScore: number | null;
  message: string;
  practiceAvailable: boolean;
}

interface HomeScreenProps {
  /** UTC ISO date of today's pack, e.g. "2026-07-10". */
  date: string;
  puzzleCount: number;
  onStart: () => void;
  /** Cloud mode only: start (or resume) today's ONE ranked brew. */
  onStartRanked?: () => void;
  /** Cloud mode only: start a fresh unranked Practice Brew (reserve content). */
  onPractice?: () => void;
  /** Cloud mode only: the player's ranked standing for today. */
  ranked?: HomeRankedStatus;
  /** Cloud mode only: the daily rank summary, shown once today's ranked brew is done. */
  rankSummary?: MyRankSummaryView;
  onViewLeaderboards?: () => void;
  /** Cloud mode only: the streak/habit summary (shown after core Home content). */
  progressSummary?: ProgressSummaryView;
  onViewProgress?: () => void;
  /** Dev-only pack switcher. Undefined in a release build. */
  devTools?: ReactNode;
  /** Cloud mode only: the player card affordance. */
  username?: string | null;
  onOpenProfile?: () => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return `${MONTHS[month - 1]} ${day}`;
}

export function HomeScreen({
  date, puzzleCount, onStart, onStartRanked, onPractice, ranked, rankSummary, onViewLeaderboards,
  progressSummary, onViewProgress, devTools, username, onOpenProfile,
}: HomeScreenProps) {
  const practice = onPractice ?? onStart;
  // The ranked affordance only exists in cloud mode (where `ranked` is provided).
  const canPlayRanked = Boolean(onStartRanked && ranked && ranked.eligible);
  const rankedActive = ranked?.state === 'active';
  const rankedDone = ranked?.state === 'completed';
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AnimatedMount distance={14}>
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <BrewMark size={52} />
              {onOpenProfile && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open your player card"
                  onPress={onOpenProfile}
                  style={({ pressed }) => [styles.profileChip, pressed && styles.profileChipPressed]}
                >
                  <Text style={styles.profileInitial}>{(username ?? '?').slice(0, 1).toUpperCase()}</Text>
                  <Text style={styles.profileName} numberOfLines={1}>{username ?? 'Player'}</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.heroText}>
              <Wordmark />
              <Text style={styles.tagline}>Five minutes. Sharper every morning.</Text>
            </View>
          </View>
        </AnimatedMount>

        <AnimatedMount delay={STAGGER_MS} distance={14}>
          <View style={styles.card}>
            <Text style={styles.date}>{formatDate(date).toUpperCase()}</Text>
            <Text style={styles.cardTitle}>Today's Brew</Text>
            <Text style={styles.cardSubtitle}>
              {puzzleCount} challenges · about 4 minutes
            </Text>

            <View style={styles.divider} />

            <View style={styles.rhythm}>
              {CATEGORY_ORDER.map((category, i) => (
                <View key={category} style={styles.rhythmRow}>
                  <Text style={[styles.rhythmIndex, { color: CATEGORY_ACCENTS[category] }]}>
                    {i + 1}
                  </Text>
                  <CategoryMark category={category} size={15} />
                  <Text style={styles.rhythmLabel}>{CATEGORY_LABELS[category]}</Text>
                </View>
              ))}
            </View>
          </View>
        </AnimatedMount>

        {ranked && (
          <AnimatedMount delay={STAGGER_MS * 1.5} distance={14}>
            <View style={[styles.rankedCard, rankedDone && styles.rankedCardDone]}>
              <View style={styles.rankedHead}>
                <Text style={styles.rankedEyebrow}>
                  {rankedDone ? "TODAY'S RANKED BREW" : rankedActive ? 'RANKED · IN PROGRESS' : 'RANKED'}
                </Text>
                {rankedDone && ranked.lockedScore != null && (
                  <Text style={styles.rankedScore}>{ranked.lockedScore}<Text style={styles.rankedScoreMax}> / 100</Text></Text>
                )}
              </View>
              <Text style={styles.rankedMessage}>{ranked.message}</Text>
            </View>
          </AnimatedMount>
        )}

        {rankedDone && rankSummary && onViewLeaderboards && (
          <AnimatedMount delay={STAGGER_MS * 1.75} distance={14}>
            <RankComparison view={rankSummary} onViewLeaderboards={onViewLeaderboards} compact />
          </AnimatedMount>
        )}

        {progressSummary && onViewProgress && (
          <AnimatedMount delay={STAGGER_MS * 2} distance={14}>
            <StreakSummary view={progressSummary} onViewProgress={onViewProgress} context="home" />
          </AnimatedMount>
        )}

        <AnimatedMount delay={STAGGER_MS * 2} distance={14}>
          <View style={styles.footer}>
            {rankedActive ? (
              <>
                <Button label="Continue Ranked Brew" onPress={onStartRanked!} />
                {ranked?.practiceAvailable && (
                  <Button label="Practice Brew" variant="secondary" onPress={practice} />
                )}
              </>
            ) : canPlayRanked ? (
              <>
                <Button label="Start Today's Ranked Brew" onPress={onStartRanked!} />
                {ranked?.practiceAvailable && (
                  <Button label="Practice Brew" variant="secondary" onPress={practice} />
                )}
              </>
            ) : rankedDone ? (
              <Button label="Practice Brew" onPress={practice} />
            ) : (
              <Button label="Start Today's Brew" onPress={onStart} />
            )}
            <Text style={styles.ritual}>
              {onPractice ? 'Practice Brews are fresh, unranked, and never affect your ranked score.' : 'The same five challenges, everywhere in the world.'}
            </Text>
            {devTools}
          </View>
        </AnimatedMount>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'space-between',
    gap: spacing.xl,
    paddingVertical: spacing.lg,
  },

  hero: { gap: spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 160,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    backgroundColor: colors.surface,
  },
  // Immediate tap acknowledgement — the chip depresses into its surface.
  profileChipPressed: { backgroundColor: colors.surfaceRaised, borderColor: colors.textMuted },
  profileInitial: {
    width: 26, height: 26, borderRadius: 13, textAlign: 'center', lineHeight: 26,
    backgroundColor: colors.mint, color: colors.background, fontWeight: '800', fontSize: 13,
    overflow: 'hidden',
  },
  profileName: { ...typography.caption, color: colors.text, flexShrink: 1 },
  heroText: { gap: spacing.sm },
  tagline: { ...typography.body, color: colors.textMuted },

  card: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    ...shadow.card,
  },
  date: { ...typography.label, color: colors.mint },
  cardTitle: { ...typography.title, color: colors.text, marginTop: spacing.sm },
  cardSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  rhythm: { gap: spacing.md },
  rhythmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rhythmIndex: { ...typography.label, width: 10 },
  rhythmLabel: { ...typography.body, color: colors.text },

  rankedCard: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.mint,
    borderTopColor: colors.borderHighlight,
    gap: spacing.sm,
    ...shadow.card,
  },
  rankedCardDone: { borderColor: colors.border },
  rankedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rankedEyebrow: { ...typography.label, color: colors.mint },
  rankedScore: { ...typography.title, fontSize: 22, color: colors.text },
  rankedScoreMax: { ...typography.caption, color: colors.textFaint },
  rankedMessage: { ...typography.body, color: colors.textMuted },

  footer: { gap: spacing.md },
  ritual: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
  },
});
