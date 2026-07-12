import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { useArchives } from '../cloud/archive/useArchives';
import { analytics } from '../cloud/analytics';
import type { ArchivePack } from '../cloud/archive/archiveValidate';
import { colors, radius, spacing, typography } from '../theme/theme';

interface Props {
  date: string;
  authUserId: string | null;
  onBack: () => void;
  onStart: (date: string) => void;
  busy?: boolean;
}

const CAT_LABEL: Record<string, string> = {
  observation: 'Observation', pattern: 'Pattern', logic: 'Logic', 'language-logic': 'Language Logic', 'attention-speed': 'Attention Speed',
};

/**
 * Historical pack detail. Entitlement is re-checked SERVER-SIDE on start (client
 * visibility is not authorization). Void-adjusted: a voided slot is shown as
 * excluded and the denominator reflects the active slots.
 */
export function ArchivePackDetailScreen({ date, authUserId, onBack, onStart, busy = false }: Props) {
  const arch = useArchives(false, authUserId);
  const [pack, setPack] = useState<ArchivePack | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    analytics.track('archive_date_selected', { properties: { age_band: 'past' } });
    arch.getPack(date).then(
      (p) => { if (alive) { setPack(p); setPhase('ready'); } },
      () => { if (alive) setPhase('error'); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const active = pack?.slots.filter((s) => !s.voided) ?? [];
  const denominator = active.length * 20;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}><Text style={styles.back}>‹ Archives</Text></Pressable>
        <Text style={styles.tag}>ARCHIVE BREW · UNRANKED</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {phase === 'loading' && <View style={styles.center}><ActivityIndicator color={colors.mint} /></View>}
        {phase === 'error' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn’t load this Brew</Text>
            <Text style={styles.muted}>It may be unavailable. Go back and pick another date.</Text>
          </View>
        )}
        {phase === 'ready' && pack && (
          <>
            <Text style={styles.date}>{pack.rankedDate}</Text>
            <Text style={styles.muted}>{pack.difficultyLabel} · {active.length} of 5 puzzles active{active.length < 5 ? ' (a slot was voided)' : ''}</Text>
            <View style={{ height: spacing.md }} />
            <View style={styles.card}>
              {active.map((s) => (
                <View key={s.position} style={styles.row}>
                  <Text style={styles.pos}>{s.position}</Text>
                  <Text style={styles.cat}>{CAT_LABEL[s.category] ?? s.category}</Text>
                </View>
              ))}
              {pack.slots.filter((s) => s.voided).map((s) => (
                <View key={`v${s.position}`} style={styles.row}>
                  <Text style={styles.pos}>{s.position}</Text>
                  <Text style={[styles.cat, { color: colors.textFaint }]}>{CAT_LABEL[s.category] ?? s.category} · voided</Text>
                </View>
              ))}
            </View>
            <Text style={styles.muted}>Scored out of {denominator}. This session is unranked — it never affects ranked scores, streaks or leaderboards.</Text>
            <View style={{ height: spacing.lg }} />
            <Button label={busy ? 'Starting…' : 'Start Archive Brew'} onPress={() => onStart(pack.rankedDate)} disabled={busy} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { ...typography.body, color: colors.mint },
  tag: { ...typography.label, color: colors.gold },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  center: { alignItems: 'center', paddingVertical: spacing.xl },
  date: { ...typography.title, color: colors.text },
  muted: { ...typography.caption, color: colors.textMuted },
  card: { backgroundColor: colors.surfaceRaised, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { ...typography.heading, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 },
  pos: { ...typography.label, color: colors.mint, width: 20 },
  cat: { ...typography.body, color: colors.text },
});
