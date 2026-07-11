import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BrewMark } from '../components/brand/BrewMark';
import { CategoryMark } from '../components/brand/CategoryMark';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { useProgressScreen } from '../cloud/useProgress';
import { formatSolveTime, streakMilestone, type ValidCategoryStat, type ValidPracticeSummary, type ValidProgressDetail, type ValidProgressSummary } from '../cloud/validate';
import { CATEGORY_ACCENTS, colors, MIN_TAP_TARGET, radius, shadow, spacing, typography } from '../theme/theme';
import { CATEGORY_LABELS, type Category } from '../types/puzzle';

interface ProgressScreenProps {
  onBack: () => void;
  onViewLeaderboards?: () => void;
}

const MAX_POINTS = 20;

export function ProgressScreen({ onBack, onViewLeaderboards }: ProgressScreenProps) {
  const p = useProgressScreen(true);
  const { phase, summary, detail } = p;

  const body = () => {
    if (phase === 'loading' && !summary) return <ProgressSkeleton />;
    if (phase === 'error' && !summary) {
      return (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>Couldn’t load your progress</Text>
          <Text style={styles.stateBody}>Your results are safe. Please try again.</Text>
          <View style={styles.stateAction}><Button label="Try again" onPress={p.refresh} /></View>
        </View>
      );
    }
    if (summary?.locked) {
      return (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>Progress is for ranked players</Text>
          <Text style={styles.stateBody}>Secure your progress and play Today’s Ranked Brew to start your streak.</Text>
        </View>
      );
    }
    if (summary && summary.rankedDaysCompleted === 0) {
      return (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>No ranked days yet</Text>
          <Text style={styles.stateBody}>Complete Today’s Ranked Brew to start your streak and progress.</Text>
        </View>
      );
    }
    if (!summary) return <ProgressSkeleton />;

    return (
      <>
        <StreakHeader summary={summary} />
        <TodayStatus summary={summary} />
        <LifetimeTotals summary={summary} />
        {detail && detail.categories.length > 0 && <CategoryPerformance categories={detail.categories} />}
        {detail && <CompletionCalendar detail={detail} />}
        <RecentScores rows={p.history} />
        {p.practice && p.practice.brewsCompleted > 0 && <PracticeSection practice={p.practice} />}
        {p.historyHasMore && (
          <Button label={p.loadingMore ? 'Loading…' : 'Show more days'} variant="secondary" onPress={p.loadMore} disabled={p.loadingMore} />
        )}
        {onViewLeaderboards && (
          <Pressable onPress={onViewLeaderboards} style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}>
            <Text style={styles.linkText}>See today’s leaderboards →</Text>
          </Pressable>
        )}
      </>
    );
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <View style={styles.titleWrap}><BrewMark size={18} /><Text style={styles.title}>Progress</Text></View>
        <View style={styles.backBtn} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={p.refresh} tintColor={colors.mint} colors={[colors.mint]} />}
      >
        {body()}
      </ScrollView>
    </Screen>
  );
}

function StreakHeader({ summary }: { summary: ValidProgressSummary }) {
  const milestone = streakMilestone(summary.currentStreak);
  return (
    <View style={[styles.streakCard, milestone != null && styles.streakCardGold]}>
      <View style={styles.streakMain}>
        <Text style={[styles.streakBig, milestone != null && styles.gold]}>{summary.currentStreak}</Text>
        <Text style={styles.streakUnit}>day{summary.currentStreak === 1 ? '' : 's'}</Text>
      </View>
      <View style={styles.streakSide}>
        <Text style={styles.streakLabel}>CURRENT RANKED STREAK</Text>
        <Text style={styles.streakBest}>Best {summary.bestStreak} · {summary.rankedDaysCompleted} ranked {summary.rankedDaysCompleted === 1 ? 'day' : 'days'}</Text>
        {milestone != null && <Text style={styles.milestone}>{milestone}-day milestone reached</Text>}
      </View>
    </View>
  );
}

function TodayStatus({ summary }: { summary: ValidProgressSummary }) {
  return (
    <View style={styles.today}>
      <View style={[styles.dot, { backgroundColor: summary.todayCompleted ? colors.correct : colors.border }]} />
      <Text style={styles.todayText}>
        {summary.todayCompleted ? 'Today’s ranked brew is complete' : 'Today’s ranked brew isn’t done yet'}
      </Text>
    </View>
  );
}

function LifetimeTotals({ summary }: { summary: ValidProgressSummary }) {
  return (
    <View style={styles.totals}>
      <Stat label="Avg score" value={summary.averageScore != null ? String(summary.averageScore) : '—'} />
      <Stat label="Best" value={summary.bestScore != null ? String(summary.bestScore) : '—'} />
      <Stat label="Perfect 100s" value={String(summary.perfectScores)} />
      <Stat label="Avg time" value={summary.averageSolveMs != null ? formatSolveTime(summary.averageSolveMs) : '—'} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CategoryPerformance({ categories }: { categories: ValidCategoryStat[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Category performance</Text>
      <Text style={styles.sectionHint}>Average points earned out of {MAX_POINTS}</Text>
      <View style={styles.catList}>
        {categories.map((c) => {
          const accent = CATEGORY_ACCENTS[c.category as Category] ?? colors.mint;
          const pct = Math.max(2, Math.min(100, (c.averagePoints / MAX_POINTS) * 100));
          return (
            <View key={c.category} style={styles.catRow}>
              <CategoryMark category={c.category as Category} size={14} />
              <View style={styles.catBody}>
                <View style={styles.catTop}>
                  <Text style={styles.catName} numberOfLines={1}>{CATEGORY_LABELS[c.category as Category] ?? c.category}</Text>
                  <Text style={styles.catValue}>{c.averagePoints}<Text style={styles.catMax}> / {MAX_POINTS}</Text></Text>
                </View>
                <View style={styles.track}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: accent }]} /></View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CompletionCalendar({ detail }: { detail: ValidProgressDetail }) {
  const cells = useMemo(() => {
    const { today, fromDate, firstRankedDate, completed } = detail.calendar;
    if (!today || !fromDate) return [];
    const done = new Map(completed.map((c) => [c.date, c.updatedAfterValidation]));
    const start = new Date(`${fromDate}T00:00:00Z`);
    const end = new Date(`${today}T00:00:00Z`);
    const first = firstRankedDate ? new Date(`${firstRankedDate}T00:00:00Z`) : null;
    const out: { date: string; state: 'completed' | 'updated' | 'today' | 'missed' | 'neutral' }[] = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      let state: 'completed' | 'updated' | 'today' | 'missed' | 'neutral';
      if (done.has(iso)) state = done.get(iso) ? 'updated' : 'completed';
      else if (iso === today) state = 'today';
      else if (first && d >= first) state = 'missed';
      else state = 'neutral';
      out.push({ date: iso, state });
    }
    return out;
  }, [detail]);

  if (cells.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Completion calendar</Text>
      <Text style={styles.sectionHint}>Last {cells.length} days (UTC)</Text>
      <View style={styles.calGrid}>
        {cells.map((c) => (
          <View
            key={c.date}
            accessibilityLabel={`${c.date}: ${c.state === 'completed' || c.state === 'updated' ? 'completed' : c.state === 'today' ? 'today, not yet complete' : c.state === 'missed' ? 'missed' : 'before you started'}`}
            style={[styles.cell, calStyle(c.state)]}
          >
            {(c.state === 'completed' || c.state === 'updated') && <Text style={styles.cellMark}>{c.state === 'updated' ? '↻' : '✓'}</Text>}
            {c.state === 'today' && <View style={styles.cellToday} />}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <Legend swatch={styles.legDone} label="Completed" />
        <Legend swatch={styles.legToday} label="Today" />
        <Legend swatch={styles.legMissed} label="Missed" />
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: object; label: string }) {
  return <View style={styles.legItem}><View style={[styles.legSwatch, swatch]} /><Text style={styles.legText}>{label}</Text></View>;
}

function RecentScores({ rows }: { rows: { rankedDate: string; score: number; totalSolveMs: number; updatedAfterValidation: boolean }[] }) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Recent BrewScores</Text>
      <View style={styles.histList}>
        {rows.map((r) => (
          <View key={r.rankedDate} style={styles.histRow}>
            <Text style={styles.histDate}>{r.rankedDate}</Text>
            <Text style={styles.histTime}>{formatSolveTime(r.totalSolveMs)}{r.updatedAfterValidation ? ' · updated' : ''}</Text>
            <Text style={styles.histScore}>{r.score}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PracticeSection({ practice }: { practice: ValidPracticeSummary }) {
  return (
    <View style={styles.practiceWrap}>
      <View style={styles.practiceHead}>
        <Text style={styles.practiceEyebrow}>PRACTICE · UNRANKED</Text>
        <Text style={styles.practiceHint}>Never affects your ranked score, streak, or leaderboard.</Text>
      </View>
      <View style={styles.totals}>
        <Stat label="Brews" value={String(practice.brewsCompleted)} />
        <Stat label="Avg" value={practice.averageScore != null ? String(practice.averageScore) : '—'} />
        <Stat label="Best" value={practice.bestScore != null ? String(practice.bestScore) : '—'} />
        <Stat label="Avg time" value={practice.averageSolveMs != null ? formatSolveTime(practice.averageSolveMs) : '—'} />
      </View>
      {practice.categories.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Practice category performance</Text>
          <Text style={styles.sectionHint}>Average points earned out of {MAX_POINTS}</Text>
          <View style={styles.catList}>
            {practice.categories.map((c) => {
              const accent = CATEGORY_ACCENTS[c.category as Category] ?? colors.mint;
              const pct = Math.max(2, Math.min(100, (c.averagePoints / MAX_POINTS) * 100));
              return (
                <View key={c.category} style={styles.catRow}>
                  <CategoryMark category={c.category as Category} size={14} />
                  <View style={styles.catBody}>
                    <View style={styles.catTop}>
                      <Text style={styles.catName} numberOfLines={1}>{CATEGORY_LABELS[c.category as Category] ?? c.category}</Text>
                      <Text style={styles.catValue}>{c.averagePoints}<Text style={styles.catMax}> / {MAX_POINTS}</Text></Text>
                    </View>
                    <View style={styles.track}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: accent }]} /></View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

function calStyle(state: string) {
  switch (state) {
    case 'completed': return styles.cellDone;
    case 'updated': return styles.cellUpdated;
    case 'today': return styles.cellTodayWrap;
    case 'missed': return styles.cellMissed;
    default: return styles.cellNeutral;
  }
}

function ProgressSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      {[0, 1, 2, 3].map((i) => <View key={i} style={styles.skeletonBlock} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  backBtnPressed: { backgroundColor: colors.surface },
  backChevron: { color: colors.text, fontSize: 30, lineHeight: 32, marginTop: -2 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.heading, color: colors.text },

  content: { gap: spacing.lg, paddingBottom: spacing.xl * 2 },

  streakCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.lg,
    borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderHighlight, ...shadow.card,
  },
  streakCardGold: { borderColor: colors.gold },
  streakMain: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  streakBig: { ...typography.score, fontSize: 52, lineHeight: 56, color: colors.mint },
  gold: { color: colors.gold },
  streakUnit: { ...typography.body, color: colors.textMuted },
  streakSide: { flex: 1, gap: 2 },
  streakLabel: { ...typography.label, color: colors.mint },
  streakBest: { ...typography.caption, color: colors.textMuted },
  milestone: { ...typography.caption, color: colors.gold },

  today: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  todayText: { ...typography.body, color: colors.text },

  totals: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderHighlight },
  statValue: { ...typography.title, fontSize: 20, color: colors.text },
  statLabel: { ...typography.caption, fontSize: 11, color: colors.textFaint, marginTop: 2 },

  section: { gap: spacing.sm },
  sectionTitle: { ...typography.heading, color: colors.text },
  sectionHint: { ...typography.caption, color: colors.textFaint },

  catList: { gap: spacing.md, marginTop: spacing.xs },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  catBody: { flex: 1, gap: 6 },
  catTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  catName: { ...typography.option, color: colors.text, flex: 1 },
  catValue: { ...typography.body, fontWeight: '700', color: colors.text },
  catMax: { ...typography.caption, color: colors.textFaint, fontWeight: '400' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },

  calGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs },
  cell: { width: 26, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  cellDone: { backgroundColor: colors.mint },
  cellUpdated: { backgroundColor: colors.mint },
  cellTodayWrap: { borderWidth: 1.5, borderColor: colors.mint },
  cellMissed: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  cellNeutral: { backgroundColor: colors.surface, opacity: 0.5 },
  cellMark: { color: colors.background, fontSize: 13, fontWeight: '800' },
  cellToday: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.mint },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legSwatch: { width: 12, height: 12, borderRadius: 3 },
  legDone: { backgroundColor: colors.mint },
  legToday: { borderWidth: 1.5, borderColor: colors.mint },
  legMissed: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  legText: { ...typography.caption, fontSize: 11, color: colors.textMuted },

  histList: { gap: spacing.xs, marginTop: spacing.xs },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  histDate: { ...typography.body, color: colors.text, width: 96 },
  histTime: { ...typography.caption, color: colors.textFaint, flex: 1 },
  histScore: { ...typography.heading, color: colors.text },

  link: { minHeight: MIN_TAP_TARGET, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  linkPressed: { backgroundColor: colors.surface },
  linkText: { ...typography.body, color: colors.mint, fontWeight: '600' },

  practiceWrap: {
    gap: spacing.md, marginTop: spacing.sm, paddingTop: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  practiceHead: { gap: 2 },
  practiceEyebrow: { ...typography.label, color: colors.textMuted },
  practiceHint: { ...typography.caption, fontSize: 11, color: colors.textFaint },

  state: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm },
  stateTitle: { ...typography.title, fontSize: 18, color: colors.text, textAlign: 'center' },
  stateBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  stateAction: { alignSelf: 'stretch', marginTop: spacing.sm },
  skeletonBlock: { height: 72, borderRadius: radius.lg, backgroundColor: colors.surface, opacity: 0.6 },
});
