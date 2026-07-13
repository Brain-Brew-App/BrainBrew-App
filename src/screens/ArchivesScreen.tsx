import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { RANKED_FAIRNESS_PROMISE } from '../cloud/entitlements';
import { useArchives } from '../cloud/archive/useArchives';
import type { ValidEntitlements } from '../cloud/validate';
import { colors, radius, spacing, typography } from '../theme/theme';

interface Props {
  entitlements: ValidEntitlements | null;
  authUserId: string | null;
  onBack: () => void;
  onOpenPremium: () => void;
  onSelectDate: (date: string) => void;
}

/**
 * Premium Archives — browse PAST daily packs to replay UNRANKED. Entitlement is
 * server-authoritative (the calendar's `locked` flag comes from the server, not a
 * client isPremium guess). Free players see a calm locked state; Premium players
 * see past dates only. Never blocks Home; loads only when opened.
 */
export function ArchivesScreen({ entitlements, authUserId, onBack, onOpenPremium, onSelectDate }: Props) {
  const arch = useArchives(true, authUserId);
  const canArchive = !!entitlements?.capabilities?.archives && !arch.locked;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Archives</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.utc}>Replay past Daily Brews. Dates are UTC. Every Archive Brew is unranked.</Text>
        <Text style={styles.fair}>{RANKED_FAIRNESS_PROMISE}</Text>

        {arch.phase === 'loading' && (
          <View style={styles.center}><ActivityIndicator color={colors.mint} accessibilityLabel="Loading" /><Text style={styles.muted}>Loading Archives…</Text></View>
        )}

        {arch.phase === 'error' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load Archives</Text>
            <Text style={styles.muted}>Check your connection and try again.</Text>
            <View style={{ height: spacing.md }} />
            <Button label="Retry" onPress={arch.refresh} variant="secondary" />
          </View>
        )}

        {arch.phase === 'ready' && !canArchive && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Archives is a Premium feature</Text>
            <Text style={styles.muted}>
              Open any past Daily Brew and play it again as an unranked session. Your ranked scores,
              streaks and leaderboards are never affected.
            </Text>
            <View style={{ height: spacing.lg }} />
            <Button label="Open Premium" onPress={onOpenPremium} />
            <View style={{ height: spacing.sm }} />
            <Button label="Restore Purchases" onPress={onOpenPremium} variant="secondary" />
          </View>
        )}

        {arch.phase === 'ready' && canArchive && (arch.calendar?.dates.length ?? 0) === 0 && (
          <View style={styles.card}><Text style={styles.muted}>No past Daily Brews yet — check back tomorrow.</Text></View>
        )}

        {arch.phase === 'ready' && canArchive && (arch.calendar?.dates.length ?? 0) > 0 && (
          <View style={{ gap: spacing.sm }}>
            {arch.calendar!.dates.map((d) => (
              <Pressable
                key={d.rankedDate}
                onPress={() => onSelectDate(d.rankedDate)}
                accessibilityRole="button"
                accessibilityLabel={`Open Archive Brew for ${d.rankedDate}`}
                style={({ pressed }) => [styles.dateCard, pressed && { opacity: 0.8 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dateText}>{d.rankedDate}</Text>
                  <Text style={styles.muted}>{d.difficultyLabel}{d.incident ? ' · adjusted' : ''}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { ...typography.body, color: colors.mint, minWidth: 48 },
  title: { ...typography.title, color: colors.text },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  utc: { ...typography.body, color: colors.text },
  fair: { ...typography.caption, color: colors.textMuted },
  center: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  muted: { ...typography.caption, color: colors.textMuted },
  card: { backgroundColor: colors.surfaceRaised, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  cardTitle: { ...typography.heading, color: colors.text, marginBottom: spacing.xs },
  dateCard: { minHeight: 56, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  dateText: { ...typography.heading, color: colors.text },
  chevron: { ...typography.title, color: colors.textFaint },
});
