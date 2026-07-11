import { StyleSheet, View } from 'react-native';

import { colors } from '../theme/theme';
import type { Figure as FigureData } from '../types/puzzle';

interface FigureProps {
  figure: FigureData;
  /** Size of one shape, in dp. */
  size?: number;
  tone?: string;
}

/**
 * Renders a Matrix Completion figure: `count` copies of `shape`, drawn at
 * `fill`.
 *
 * Every attribute is geometric — shape, count, fill fraction. None is colour,
 * so the whole engine survives greyscale and colour blindness (§13). Drawn from
 * Views, so it is font-independent.
 */
export function Figure({ figure, size = 18, tone = colors.text }: FigureProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: figure.count }, (_, i) => (
        <Shape key={i} shape={figure.shape} fill={figure.fill} size={size} tone={tone} />
      ))}
    </View>
  );
}

function Shape({
  shape,
  fill,
  size,
  tone,
}: {
  shape: FigureData['shape'];
  fill: FigureData['fill'];
  size: number;
  tone: string;
}) {
  const isDiamond = shape === 'diamond';

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderWidth: 1.8,
          borderColor: tone,
          backgroundColor: fill === 'solid' ? tone : 'transparent',
        },
        shape === 'circle' && { borderRadius: size / 2 },
        // A diamond is a square turned 45°.
        isDiamond && { transform: [{ rotate: '45deg' }] },
        // Clips the half-fill to the shape's own outline.
        styles.clip,
      ]}
    >
      {fill === 'half' && (
        <HalfFill size={size} tone={tone} counterRotate={isDiamond} />
      )}
    </View>
  );
}

/**
 * The lower half of the shape, measured in **screen space** — not in the
 * shape's own rotated frame.
 *
 * Without the counter-rotation a diamond's half-fill is cut along its diagonal
 * and reads as a triangle, so "half" would mean two different things depending
 * on which shape carried it. `fill` is a load-bearing attribute in Matrix
 * Completion; it has to look the same on every shape.
 *
 * The oversized wrapper is centred on the parent, so rotating it back by -45°
 * leaves it axis-aligned while its bottom half still covers the whole lower
 * half of the diamond. The parent's `overflow: hidden` clips it to the outline.
 */
function HalfFill({
  size,
  tone,
  counterRotate,
}: {
  size: number;
  tone: string;
  counterRotate: boolean;
}) {
  if (!counterRotate) return <View style={[styles.half, { backgroundColor: tone }]} />;

  return (
    <View
      style={{
        position: 'absolute',
        width: size * 2,
        height: size * 2,
        left: -size / 2 - 1.8,
        top: -size / 2 - 1.8,
        transform: [{ rotate: '-45deg' }],
      }}
    >
      <View style={[styles.half, { backgroundColor: tone }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  clip: { overflow: 'hidden' },
  half: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '50%' },
});
