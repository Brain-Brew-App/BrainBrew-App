import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadow, spacing, typography } from '../theme/theme';
import { AnimatedMount } from './AnimatedMount';
import { Button } from './Button';

interface TaskBriefProps {
  accent: string;
  /** Eyebrow above the focal content, e.g. "YOUR TARGET". */
  label: string;
  /** The thing the player must memorise before starting — a glyph, a rule. */
  focus: ReactNode;
  /** One line naming what to do and what to ignore. */
  hint: string;
  onBegin: () => void;
}

/**
 * The untimed brief that precedes every Attention Speed task.
 *
 * Shared by Symbol Sweep and Rapid Classification. Nothing is timed here and
 * the task surface is not yet mounted, so reading is free — the copy says so
 * explicitly, because a player who does not trust that will rush.
 */
export function TaskBrief({ accent, label, focus, hint, onBegin }: TaskBriefProps) {
  return (
    <AnimatedMount style={styles.root}>
      <View style={styles.card}>
        <Text style={[styles.label, { color: accent }]}>{label}</Text>
        <View style={styles.focus}>{focus}</View>
        <Text style={styles.hint}>{hint}</Text>
      </View>

      <Text style={styles.timing}>
        The clock starts when you tap Begin. Take your time reading this.
      </Text>

      <Button label="Begin" onPress={onBegin} />
    </AnimatedMount>
  );
}

/** The live countdown. Only ever rendered once the clock is actually running. */
export function TimerChip({ seconds, accent }: { seconds: number; accent: string }) {
  return (
    <View style={styles.timer}>
      <Text style={[styles.timerValue, { color: accent }]}>{seconds}</Text>
      <Text style={styles.timerUnit}>SEC</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    ...shadow.card,
  },
  label: { ...typography.label },
  focus: { alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  hint: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  timing: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },

  timer: {
    minWidth: 56,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timerValue: { ...typography.timer },
  timerUnit: { ...typography.label, fontSize: 10, color: colors.textMuted },
});
