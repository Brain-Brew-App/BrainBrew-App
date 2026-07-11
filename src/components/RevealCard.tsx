import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { MAX_POINTS_PER_PUZZLE } from '../scoring/brewScore';
import { USE_NATIVE_DRIVER, useReducedMotion } from '../theme/motion';
import { colors, radius, shadow, spacing, typography } from '../theme/theme';
import type { CategoryResult } from '../types/puzzle';
import { AnimatedMount } from './AnimatedMount';
import { verdictOf } from './verdict';

interface RevealCardProps {
  result: CategoryResult;
  explanation: string;
  /** Rendered in the card's action slot — the Continue button. */
  children: ReactNode;
}

/**
 * The post-answer card: verdict, points, explanation, and the way forward.
 *
 * It occupies a fixed slot at the bottom of the session screen, so it can enter
 * without pushing the puzzle content — the content above stays exactly where it
 * was. Only opacity and transform animate.
 */
export function RevealCard({ result, explanation, children }: RevealCardProps) {
  const verdict = verdictOf(result);

  return (
    <AnimatedMount distance={16} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.verdictRow}>
          <VerdictMark mark={verdict.mark} color={verdict.color} />
          <Text style={[styles.verdict, { color: verdict.color }]}>{verdict.label}</Text>
        </View>
        <Text style={styles.points}>
          +{result.points}
          <Text style={styles.pointsMax}> / {MAX_POINTS_PER_PUZZLE}</Text>
        </Text>
      </View>

      <Text style={styles.explanation}>{explanation}</Text>

      {children}
    </AnimatedMount>
  );
}

/** The tick/half/cross springs in a beat after the card. One small pop, no bounce. */
function VerdictMark({ mark, color }: { mark: string; color: string }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(reduced ? 1 : 0.4)).current;

  useEffect(() => {
    if (reduced) {
      scale.setValue(1);
      return;
    }
    const animation = Animated.spring(scale, {
      toValue: 1,
      delay: 90,
      speed: 18,
      bounciness: 7,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [reduced, scale]);

  return (
    <Animated.Text style={[styles.mark, { color, transform: [{ scale }] }]}>{mark}</Animated.Text>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    ...shadow.card,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mark: { fontSize: 20, fontWeight: '700' },
  verdict: { ...typography.heading },
  points: { fontSize: 20, fontWeight: '700', color: colors.text },
  pointsMax: { fontSize: 14, fontWeight: '400', color: colors.textMuted },
  explanation: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
});
