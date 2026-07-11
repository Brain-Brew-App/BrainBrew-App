import { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useHasAnswerKey } from '../engines/revealContext';
import { usePressScale } from '../theme/motion';
import { colors, MIN_TAP_TARGET, radius, spacing, typography } from '../theme/theme';
import type { OrderItem } from '../types/puzzle';

interface OrderingInputProps {
  items: OrderItem[];
  correctOrder: string[];
  revealed: boolean;
  accent: string;
  /** Fires once, when the last slot is filled. */
  onComplete: (orderedIds: string[]) => void;
  /** "first to last" for Logic, "left to right" for a sentence. */
  hint: string;
}

/**
 * Tap-to-order. Shared by `LOG_003` Ordering and `LNG_003` Sentence Ordering.
 *
 * **Never drag.** Drag targets are an accessibility failure on small screens and
 * a nightmare with assistive tech (Catalog §LOG_003). Tapping a chip appends it
 * to the answer strip; tapping it again in the strip removes it. Removal must be
 * possible before commit — an un-undoable misfire would cost the whole puzzle.
 *
 * The strip announces each slot's position, so a screen-reader user knows where
 * an item landed.
 */
export function OrderingInput({
  items,
  correctOrder,
  revealed,
  accent,
  onComplete,
  hint,
}: OrderingInputProps) {
  const [order, setOrder] = useState<string[]>([]);
  const total = items.length;
  // Cloud mode has no correctOrder; show a neutral committed strip and let the
  // RevealCard carry the verdict.
  const hasKey = useHasAnswerKey();

  const place = (id: string) => {
    if (revealed || order.includes(id)) return;
    const next = [...order, id];
    setOrder(next);
    if (next.length === total) onComplete(next);
  };

  const remove = (id: string) => {
    if (revealed || order.length === total) return; // committed
    setOrder(order.filter((x) => x !== id));
  };

  const labelOf = (id: string) => items.find((i) => i.id === id)!.label;

  return (
    <View style={styles.root}>
      {/* --- the answer strip --- */}
      <View style={styles.strip}>
        {Array.from({ length: total }, (_, slot) => {
          const id = order[slot];
          const isRight = hasKey && revealed && id === correctOrder[slot];
          const isWrong = hasKey && revealed && id !== undefined && id !== correctOrder[slot];

          if (!id) {
            return (
              <View key={slot} style={[styles.slot, styles.emptySlot]}>
                <Text style={styles.slotIndex}>{slot + 1}</Text>
              </View>
            );
          }

          return (
            <Pressable
              key={slot}
              accessibilityRole="button"
              accessibilityLabel={`${labelOf(id)}, position ${slot + 1} of ${total}. Tap to remove.`}
              disabled={revealed || order.length === total}
              onPress={() => remove(id)}
              style={[
                styles.slot,
                styles.filledSlot,
                (!revealed || !hasKey) && { borderColor: accent },
                isRight && styles.right,
                isWrong && styles.wrong,
              ]}
            >
              <Text style={styles.slotIndex}>{slot + 1}</Text>
              <Text style={styles.slotLabel} numberOfLines={2}>
                {labelOf(id)}
              </Text>
              {revealed && hasKey && (
                <Text style={[styles.mark, isRight ? styles.rightMark : styles.wrongMark]}>
                  {isRight ? '✓' : '✕'}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint}>
        {order.length === 0
          ? hint
          : order.length < total
            ? `${order.length} of ${total} placed · tap a placed item to undo`
            : `${total} of ${total} placed`}
      </Text>

      {/* --- the pool of items still to place --- */}
      <View style={styles.pool}>
        {items.map((item) => (
          <Chip
            key={item.id}
            label={item.label}
            used={order.includes(item.id)}
            disabled={revealed || order.includes(item.id)}
            onPress={() => place(item.id)}
          />
        ))}
      </View>
    </View>
  );
}

function Chip({
  label,
  used,
  disabled,
  onPress,
}: {
  label: string;
  used: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { scale, onPressIn, onPressOut } = usePressScale(0.98);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={used ? `${label}, already placed` : `Place ${label}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [styles.chip, used && styles.chipUsed, pressed && !disabled && styles.chipPressed]}
      >
        <Text style={[styles.chipLabel, used && styles.chipLabelUsed]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },

  strip: { gap: spacing.xs },
  slot: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  emptySlot: { borderStyle: 'dashed', borderColor: colors.border, backgroundColor: 'transparent' },
  filledSlot: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  right: { borderColor: colors.correct, borderWidth: 2 },
  wrong: { borderColor: colors.incorrect, borderWidth: 2 },
  slotIndex: { ...typography.label, color: colors.textFaint, width: 12 },
  slotLabel: { ...typography.option, color: colors.text, flex: 1 },
  mark: { fontSize: 16, fontWeight: '700' },
  rightMark: { color: colors.correct },
  wrongMark: { color: colors.incorrect },

  hint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },

  pool: { gap: spacing.sm },
  chip: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    backgroundColor: colors.surface,
  },
  chipUsed: { opacity: 0.35, borderStyle: 'dashed' },
  chipPressed: { backgroundColor: colors.surfaceRaised },
  chipLabel: { ...typography.option, color: colors.text },
  chipLabelUsed: { color: colors.textFaint },
});
