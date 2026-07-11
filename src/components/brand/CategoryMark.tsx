import { StyleSheet, View } from 'react-native';

import { CATEGORY_ACCENTS, radius } from '../../theme/theme';
import type { Category } from '../../types/puzzle';

interface CategoryMarkProps {
  category: Category;
  size?: number;
}

/**
 * A small abstract motif per category, tinted with that category's step on the
 * mint → violet ramp. Motifs are geometric, never illustrative — the point is a
 * quiet signature beside the category label, not a mascot.
 *
 * Observation  — an iris: ring with a centred pupil.
 * Pattern      — three ascending dots: a sequence going somewhere.
 * Logic        — a 2×2 grid with one cell resolved.
 * Language     — three text lines of unequal length.
 * Attention    — the sweep target itself, a triangle.
 */
export function CategoryMark({ category, size = 16 }: CategoryMarkProps) {
  const color = CATEGORY_ACCENTS[category];
  const box = { width: size, height: size };

  switch (category) {
    case 'observation':
      return (
        <View style={[styles.center, box]}>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: Math.max(1.4, size * 0.1),
              borderColor: color,
            }}
          />
          <View
            style={[
              styles.abs,
              {
                width: size * 0.34,
                height: size * 0.34,
                borderRadius: size,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      );

    case 'pattern':
      return (
        <View style={[styles.rowEnd, box]}>
          {[0.34, 0.62, 1].map((h, i) => (
            <View
              key={i}
              style={{
                width: size * 0.24,
                height: size * 0.24,
                borderRadius: size,
                marginBottom: size * (h - 0.34) * 0.9,
                backgroundColor: color,
                opacity: 0.55 + i * 0.225,
              }}
            />
          ))}
        </View>
      );

    case 'logic': {
      const cell = size * 0.42;
      return (
        <View style={[styles.grid, box]}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                width: cell,
                height: cell,
                borderRadius: size * 0.1,
                borderWidth: 1.4,
                borderColor: color,
                backgroundColor: i === 3 ? color : 'transparent',
              }}
            />
          ))}
        </View>
      );
    }

    case 'language-logic':
      return (
        <View style={[styles.lines, box]}>
          {[1, 0.62, 0.84].map((w, i) => (
            <View
              key={i}
              style={{
                width: size * w,
                height: Math.max(1.8, size * 0.13),
                borderRadius: radius.pill,
                backgroundColor: color,
                opacity: i === 0 ? 1 : 0.55,
              }}
            />
          ))}
        </View>
      );

    case 'attention-speed':
      return (
        <View style={[styles.center, box]}>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: size * 0.45,
              borderRightWidth: size * 0.45,
              borderBottomWidth: size * 0.78,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: color,
            }}
          />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
  rowEnd: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'space-between' },
  lines: { justifyContent: 'center', gap: 2 },
});
