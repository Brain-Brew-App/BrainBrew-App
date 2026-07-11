import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme/theme';
import type { Scale } from '../types/puzzle';

interface BalanceScaleProps {
  scale: Scale;
  tone: string;
}

/**
 * One balanced scale: a single beam across a fulcrum, a pan at each end.
 *
 * The beam is always level — the diagram states a fact, it does not tip, and
 * nothing animates. Drawing the beam as one continuous line matters: two
 * separate trays read as two unrelated groups rather than as one equation.
 *
 * Language-free by design: this engine exists so Logic is not exclusively a
 * reading task for non-native English speakers (Catalog §LOG_002).
 */
export function BalanceScale({ scale, tone }: BalanceScaleProps) {
  return (
    <View style={styles.root}>
      <View style={styles.pans}>
        <Pan glyphs={scale.left} />
        <Pan glyphs={scale.right} />
      </View>

      {/* One beam spanning both pans, level. */}
      <View style={[styles.beam, { backgroundColor: tone }]} />

      {/* Fulcrum: apex touching the beam. */}
      <View style={[styles.fulcrum, { borderBottomColor: tone }]} />
    </View>
  );
}

function Pan({ glyphs }: { glyphs: string[] }) {
  return (
    <View style={styles.pan}>
      {glyphs.map((glyph, i) => (
        <Text key={i} style={styles.glyph}>
          {glyph}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  pans: { flexDirection: 'row', alignItems: 'flex-end', width: '100%' },
  pan: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
    minHeight: 30,
    paddingHorizontal: spacing.xs,
  },
  glyph: { fontSize: 22, color: colors.text, lineHeight: 28 },
  beam: { width: '100%', height: 3, borderRadius: radius.pill, marginTop: spacing.xs },
  fulcrum: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    // The border-triangle already points up: apex meets the beam, base sits below.
  },
});
