import { useMemo } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';

import { BrewMark } from '../components/brand/BrewMark';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import type { LeaderboardScope } from '../infrastructure/supabase/leaderboardClient';
import { useDailyLeaderboard } from '../cloud/useLeaderboard';
import { formatSolveTime, topPercent, type ValidLeaderboardRow, type ValidMyDailyRank } from '../cloud/validate';
import { colors, MIN_TAP_TARGET, radius, shadow, spacing, typography } from '../theme/theme';

interface LeaderboardScreenProps {
  onBack: () => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? `${MONTHS[m - 1]} ${d}` : iso;
}

export function LeaderboardScreen({ onBack }: LeaderboardScreenProps) {
  const lb = useDailyLeaderboard(true);
  const { scope, setScope, current, myRank, rankedDate } = lb;

  const countryCode = current.countryCode ?? myRank?.countryCode ?? null;
  // Is the current user already visible in the loaded rows for this scope?
  const meInList = current.rows.some((r) => r.isCurrentUser);
  const myPosition = scope === 'global' ? myRank?.globalPosition : myRank?.countryPosition;
  const showPinned = !current.locked && !meInList && myRank?.hasResult === true && myPosition != null;

  const header = useMemo(() => (
    <LeaderboardHeader
      scope={scope}
      setScope={setScope}
      countryCode={countryCode}
      total={current.total}
      rankedDate={rankedDate}
      myRank={myRank}
    />
  ), [scope, setScope, countryCode, current.total, rankedDate, myRank]);

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        >
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <BrewMark size={18} />
          <Text style={styles.title}>Leaderboards</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={current.locked ? [] : current.rows}
        keyExtractor={(r) => `${scope}-${r.position}`}
        renderItem={({ item }) => <LeaderboardRow row={item} />}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (current.hasMore) lb.loadMore(); }}
        refreshControl={
          <RefreshControl
            refreshing={current.refreshing}
            onRefresh={lb.refresh}
            tintColor={colors.mint}
            colors={[colors.mint]}
          />
        }
        ListEmptyComponent={
          <LeaderboardEmpty
            scope={scope}
            phase={current.phase}
            locked={current.locked}
            error={current.error}
            hasOwnResult={myRank?.hasResult === true}
            onRetry={lb.refresh}
          />
        }
        ListFooterComponent={
          current.loadingMore ? (
            <View style={styles.footer}><ActivityIndicator color={colors.mint} accessibilityLabel="Loading" /></View>
          ) : current.rows.length > 0 && !current.hasMore ? (
            <Text style={styles.footerEnd}>That’s everyone ranked today.</Text>
          ) : null
        }
      />

      {showPinned && myRank && (
        <PinnedYourPosition scope={scope} myRank={myRank} />
      )}
    </Screen>
  );
}

function LeaderboardHeader({
  scope, setScope, countryCode, total, rankedDate, myRank,
}: {
  scope: LeaderboardScope;
  setScope: (s: LeaderboardScope) => void;
  countryCode: string | null;
  total: number;
  rankedDate: string | null;
  myRank: ValidMyDailyRank | null;
}) {
  const pct = scope === 'global'
    ? topPercent(myRank?.globalPosition ?? null, myRank?.globalTotal ?? null, myRank?.globalPercentile ?? null)
    : topPercent(myRank?.countryPosition ?? null, myRank?.countryTotal ?? null, myRank?.countryPercentile ?? null);
  const pos = scope === 'global' ? myRank?.globalPosition : myRank?.countryPosition;

  return (
    <View>
      <View style={styles.tabs}>
        <Tab label="Global" active={scope === 'global'} onPress={() => setScope('global')} />
        <Tab label={countryCode ? `Country · ${countryCode}` : 'Country'} active={scope === 'country'} onPress={() => setScope('country')} />
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryDate}>{formatDate(rankedDate).toUpperCase()} · UTC</Text>
        <Text style={styles.summaryCount}>
          {total === 0
            ? 'No ranked players yet'
            : `${total.toLocaleString()} ranked ${total === 1 ? 'player' : 'players'} today`}
        </Text>
        {myRank?.hasResult && pos != null && (
          <Text style={styles.summaryMine}>
            You’re #{pos}{pct != null ? ` · top ${pct}%` : ''}
            {myRank.updatedAfterValidation ? ' · updated after review' : ''}
          </Text>
        )}
      </View>
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && !active && styles.tabPressed]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function LeaderboardRow({ row }: { row: ValidLeaderboardRow }) {
  return (
    <View style={[styles.row, row.isCurrentUser && styles.rowMine]}>
      <Text style={[styles.pos, row.isCurrentUser && styles.textMine]}>{row.position}</Text>
      <View style={styles.rowMid}>
        <Text style={[styles.username, row.isCurrentUser && styles.textMine]} numberOfLines={1}>
          {row.username}{row.isCurrentUser ? '  · You' : ''}
        </Text>
        <Text style={styles.solve}>{row.countryCode} · {formatSolveTime(row.solveMs)}</Text>
      </View>
      <Text style={[styles.score, row.isCurrentUser && styles.textMine]}>{row.score}</Text>
    </View>
  );
}

function PinnedYourPosition({ scope, myRank }: { scope: LeaderboardScope; myRank: ValidMyDailyRank }) {
  const pos = scope === 'global' ? myRank.globalPosition : myRank.countryPosition;
  return (
    <View style={styles.pinned}>
      <Text style={[styles.pos, styles.textMine]}>{pos}</Text>
      <View style={styles.rowMid}>
        <Text style={[styles.username, styles.textMine]} numberOfLines={1}>You</Text>
        <Text style={styles.solve}>Your position today</Text>
      </View>
      <Text style={[styles.score, styles.textMine]}>{myRank.score}</Text>
    </View>
  );
}

function LeaderboardEmpty({
  scope, phase, locked, error, hasOwnResult, onRetry,
}: {
  scope: LeaderboardScope;
  phase: string;
  locked: boolean;
  error: string | null;
  hasOwnResult: boolean;
  onRetry: () => void;
}) {
  if (locked) {
    return (
      <View style={styles.state}>
        <Text style={styles.stateTitle}>Ranked play unlocks leaderboards</Text>
        <Text style={styles.stateBody}>Secure your progress and complete Today’s Ranked Brew to see where you stand.</Text>
      </View>
    );
  }
  if (phase === 'loading') {
    return (
      <View style={styles.state}>
        {[0, 1, 2, 3, 4].map((i) => <View key={i} style={styles.skeletonRow} />)}
      </View>
    );
  }
  if (phase === 'error') {
    return (
      <View style={styles.state}>
        <Text style={styles.stateTitle}>Couldn’t load the leaderboard</Text>
        <Text style={styles.stateBody}>{error === 'network_error' ? 'Check your connection and try again.' : 'Please try again in a moment.'}</Text>
        <View style={styles.stateAction}><Button label="Try again" onPress={onRetry} /></View>
      </View>
    );
  }
  // Ready but empty.
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>
        {scope === 'country' ? 'No ranked players from your country yet' : 'No ranked players yet today'}
      </Text>
      <Text style={styles.stateBody}>
        {hasOwnResult
          ? (scope === 'country' ? 'You’re the first from your country today.' : 'You’re the first ranked player today.')
          : 'Complete Today’s Ranked Brew to join the leaderboard.'}
      </Text>
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

  listContent: { paddingBottom: spacing.xl * 2 },

  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    flex: 1, minHeight: MIN_TAP_TARGET, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.mint, borderColor: colors.mint },
  tabPressed: { backgroundColor: colors.surfaceRaised },
  tabLabel: { ...typography.option, fontWeight: '700', color: colors.textMuted },
  tabLabelActive: { color: colors.textInverse },

  summary: { marginBottom: spacing.md, gap: 2 },
  summaryDate: { ...typography.label, color: colors.mint },
  summaryCount: { ...typography.body, color: colors.text },
  summaryMine: { ...typography.caption, color: colors.textMuted },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: 56, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderHighlight,
    marginBottom: spacing.sm,
  },
  rowMine: { borderColor: colors.mint, backgroundColor: colors.surfaceRaised },
  pos: { ...typography.body, fontWeight: '800', color: colors.textMuted, minWidth: 34, textAlign: 'right' },
  rowMid: { flex: 1, gap: 2 },
  username: { ...typography.option, fontWeight: '600', color: colors.text },
  solve: { fontSize: 12, color: colors.textFaint },
  score: { ...typography.heading, color: colors.text, minWidth: 40, textAlign: 'right' },
  textMine: { color: colors.mint },

  pinned: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: 56, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.lg, backgroundColor: colors.surfaceRaised,
    borderWidth: 1, borderColor: colors.mint, ...shadow.card,
  },

  footer: { paddingVertical: spacing.lg, alignItems: 'center' },
  footerEnd: { ...typography.caption, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.lg },

  state: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.sm },
  stateTitle: { ...typography.title, fontSize: 18, color: colors.text, textAlign: 'center' },
  stateBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  stateAction: { alignSelf: 'stretch', marginTop: spacing.sm },
  skeletonRow: { height: 56, borderRadius: radius.lg, backgroundColor: colors.surface, marginBottom: spacing.sm, alignSelf: 'stretch', opacity: 0.6 },
});
