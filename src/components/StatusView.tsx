import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { AnimatedMount } from './AnimatedMount';
import { BrewMark } from './brand/BrewMark';
import { Button } from './Button';
import { Screen } from './Screen';
import { colors, radius, shadow, spacing, typography } from '../theme/theme';

interface StatusViewProps {
  /** Short calm title, e.g. "Brewing…" or "Connection lost". */
  title: string;
  /** One clarifying line. Never a raw error object or Supabase wording. */
  body?: string;
  /** Show the spinner (loading) vs a static mark (error/empty). */
  loading?: boolean;
  /** Primary action (Retry / Try again). */
  onPrimary?: () => void;
  primaryLabel?: string;
  /** Secondary action (Back to home). */
  onSecondary?: () => void;
  secondaryLabel?: string;
  /** Disable actions while a request is in flight (prevents double taps). */
  busy?: boolean;
}

/**
 * The one loading / empty / error surface for the cloud flow. Calm copy, a
 * single clear action, and a spinner only where something is genuinely in
 * flight — no infinite spinner, no stack traces, no technical wording.
 */
export function StatusView({
  title,
  body,
  loading = false,
  onPrimary,
  primaryLabel = 'Try again',
  onSecondary,
  secondaryLabel = 'Back to home',
  busy = false,
}: StatusViewProps) {
  return (
    <Screen>
      <View style={styles.container}>
        <AnimatedMount distance={12}>
          {/*
            This is the app's ONE loading/error surface — every boot, pack load,
            attempt start, scoring step and terminal error renders through it, and
            all of them were silent to TalkBack. A live region announces the title
            and body when it changes. `polite` (not `assertive`) so it does not
            interrupt the player mid-sentence.
          */}
          <View
            style={styles.card}
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={body ? `${title}. ${body}` : title}
          >
            <View style={styles.markRow} importantForAccessibility="no-hide-descendants">
              {loading ? <PulsingMark /> : <BrewMark size={40} />}
            </View>
            <Text style={styles.title}>{title}</Text>
            {body ? <Text style={styles.body}>{body}</Text> : null}
            {loading ? (
              <ActivityIndicator color={colors.mint} style={styles.spinner} accessibilityLabel="Loading" />
            ) : null}
            {onPrimary ? (
              <View style={styles.actions}>
                <Button label={primaryLabel} onPress={onPrimary} disabled={busy} />
                {onSecondary ? (
                  <Button label={secondaryLabel} variant="secondary" onPress={onSecondary} disabled={busy} />
                ) : null}
              </View>
            ) : null}
          </View>
        </AnimatedMount>
      </View>
    </Screen>
  );
}

/** The mark breathes gently while loading — a calm beat. */
function PulsingMark() {
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View style={{ opacity }}>
      <BrewMark size={40} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    ...shadow.card,
  },
  markRow: { marginBottom: spacing.xs },
  title: { ...typography.title, fontSize: 22, color: colors.text, textAlign: 'center' },
  body: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  spinner: { marginTop: spacing.xs },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm },
});
