import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { colors, spacing } from '../theme/theme';

const topInset = Platform.select({
  ios: 52,
  android: (StatusBar.currentHeight ?? 24) + spacing.sm,
  default: spacing.lg,
});

/** Navy page frame with safe top/bottom padding. Every screen sits in one. */
export function Screen({ children }: { children: ReactNode }) {
  return <View style={[styles.screen, { paddingTop: topInset }]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
});
