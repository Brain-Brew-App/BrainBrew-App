import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import { usePressScale } from '../theme/motion';
import { colors, MIN_TAP_TARGET, radius, shadow, spacing } from '../theme/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

/**
 * Mint-filled primary, outlined secondary. Always >= 48dp tall (§13).
 * Press reads as the surface depressing: a small scale spring plus a darker
 * fill, never a fade-out. Hover/focus states come from RNW's Pressable on web.
 */
export function Button({ label, onPress, variant = 'primary', disabled = false }: ButtonProps) {
  const isPrimary = variant === 'primary';
  const { scale, onPressIn, onPressOut } = usePressScale(0.975);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.base,
          isPrimary ? styles.primary : styles.secondary,
          isPrimary && !disabled && shadow.action,
          pressed && (isPrimary ? styles.primaryPressed : styles.secondaryPressed),
          disabled && styles.disabled,
        ]}
      >
        <Text style={[styles.label, isPrimary ? styles.primaryLabel : styles.secondaryLabel]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TAP_TARGET + 8,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: { backgroundColor: colors.mint },
  secondary: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
  primaryPressed: { backgroundColor: colors.mintPressed },
  secondaryPressed: { backgroundColor: colors.surface, borderColor: colors.textMuted },
  disabled: { opacity: 0.4 },
  label: { fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  primaryLabel: { color: colors.textInverse },
  secondaryLabel: { color: colors.text },
});
