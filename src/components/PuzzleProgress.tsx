import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { duration, easing, USE_NATIVE_DRIVER, useReducedMotion } from '../theme/motion';
import { colors, radius, spacing, typography } from '../theme/theme';

interface PuzzleProgressProps {
  /** Zero-based index of the puzzle in play. */
  current: number;
  total: number;
  /** Accent of the category currently in play. */
  accent: string;
}

/**
 * Five segments — the same five bars as the logo's horizon. Completed segments
 * are violet, the live one wipes in with the category's accent, the rest stay
 * dim. The fill grows left-to-right via scaleX, so nothing reflows.
 */
export function PuzzleProgress({ current, total, accent }: PuzzleProgressProps) {
  return (
    <View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`Puzzle ${current + 1} of ${total}`}
        style={styles.track}
      >
        {Array.from({ length: total }, (_, i) => (
          <Segment
            key={i}
            filled={i <= current}
            color={i < current ? colors.violetMuted : accent}
          />
        ))}
      </View>
      <Text style={styles.caption}>
        PUZZLE {current + 1} OF {total}
      </Text>
    </View>
  );
}

function Segment({ filled, color }: { filled: boolean; color: string }) {
  const reduced = useReducedMotion();
  const fill = useRef(new Animated.Value(filled ? 1 : 0)).current;

  useEffect(() => {
    const target = filled ? 1 : 0;
    if (reduced) {
      fill.setValue(target);
      return;
    }
    const animation = Animated.timing(fill, {
      toValue: target,
      duration: duration.transition,
      easing: easing.out,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [fill, filled, reduced]);

  return (
    <View style={styles.segment}>
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            opacity: fill,
            transform: [{ scaleX: fill }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: spacing.xs },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.pill,
    // Grows left-to-right instead of from the centre.
    transformOrigin: 'left',
  },
  caption: {
    ...typography.label,
    color: colors.textFaint,
    marginTop: spacing.sm,
  },
});
