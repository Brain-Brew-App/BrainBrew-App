import { Children, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme/theme';

interface GridProps {
  columns: number;
  children: ReactNode;
}

/**
 * Square-cell wrap grid, shared by Odd One Out and Symbol Sweep.
 * Percentage widths keep it honest on both native and web preview.
 */
export function Grid({ columns, children }: GridProps) {
  const width: `${number}%` = `${100 / columns}%`;

  return (
    <View style={styles.grid}>
      {Children.map(children, (child, i) => (
        <View key={i} style={[styles.cell, { width }]}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { padding: spacing.xs, aspectRatio: 1 },
});
