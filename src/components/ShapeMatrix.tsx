import { StyleSheet, View } from 'react-native';

import { colors, radius } from '../theme/theme';
import type { ShapeCells } from '../types/puzzle';

interface ShapeMatrixProps {
  cells: ShapeCells;
  /** Size of the whole matrix, in dp. Cells divide it evenly. */
  size?: number;
  tone?: string;
}

/**
 * Renders a shape as filled grid cells — never as a font glyph.
 *
 * This is the font-independent path the catalog calls for (§7 risk 1): the
 * shape is data, not a Unicode character, so it cannot render differently on
 * Android than it does on iOS. The full matrix is always drawn, including empty
 * rows, so every candidate shares one frame — cropping to the bounding box
 * would leak the answer.
 */
export function ShapeMatrix({ cells, size = 96, tone = colors.text }: ShapeMatrixProps) {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const cell = size / Math.max(rows, cols);

  return (
    <View style={[styles.root, { width: cell * cols, height: cell * rows }]}>
      {cells.map((row, r) => (
        <View key={r} style={styles.row}>
          {[...row].map((c, i) => (
            <View
              key={i}
              style={[
                { width: cell, height: cell },
                styles.cell,
                c === '#' ? { backgroundColor: tone } : styles.empty,
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'center' },
  row: { flexDirection: 'row' },
  cell: { borderRadius: radius.sm / 2, margin: 1 },
  empty: { backgroundColor: colors.surfaceRaised, opacity: 0.35 },
});
