import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, MIN_TAP_TARGET, radius, spacing, typography } from '../theme/theme';

interface DevPackSwitcherProps {
  index: number;
  count: number;
  packId: string;
  difficulty: string;
  onChange: (nextIndex: number) => void;
  onReset: () => void;
  /** True when showing today's real pack rather than an override. */
  isToday: boolean;
}

/**
 * Developer-only pack cycler. Rendered by HomeScreen only when `__DEV__`, and
 * `resolveDailyPack` ignores the override outside a dev build regardless.
 *
 * Deliberately styled as scaffolding — dashed border, monospace-ish label, no
 * accent colour. It should never be mistaken for a finished feature, and it must
 * never ship as one: real users always get the pack their date resolves to.
 */
export function DevPackSwitcher({
  index,
  count,
  packId,
  difficulty,
  onChange,
  onReset,
  isToday,
}: DevPackSwitcherProps) {
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.tag}>DEV ONLY · NOT A FEATURE</Text>
        {!isToday && (
          <Pressable accessibilityRole="button" hitSlop={12} onPress={onReset}>
            <Text style={styles.reset}>reset to today</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.row}>
        <Step label="‹" onPress={() => onChange(index - 1)} />
        <View style={styles.readout}>
          <Text style={styles.packId}>
            {packId} · {difficulty}
          </Text>
          <Text style={styles.position}>
            {index + 1} / {count}
            {isToday ? " · today's" : ' · overridden'}
          </Text>
        </View>
        <Step label="›" onPress={() => onChange(index + 1)} />
      </View>
    </View>
  );
}

function Step({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '‹' ? 'Previous pack' : 'Next pack'}
      onPress={onPress}
      style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
    >
      <Text style={styles.stepLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tag: { ...typography.label, fontSize: 10, color: colors.textFaint },
  reset: { fontSize: 11, color: colors.textMuted, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center' },
  readout: { flex: 1, alignItems: 'center' },
  packId: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  position: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  step: {
    width: MIN_TAP_TARGET,
    height: MIN_TAP_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  stepPressed: { backgroundColor: colors.surface },
  stepLabel: { fontSize: 22, color: colors.textMuted, lineHeight: 26 },
});
