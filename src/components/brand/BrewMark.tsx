import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '../../theme/theme';

interface BrewMarkProps {
  size?: number;
  /** Colour of the rising form. Defaults to mint. */
  tone?: string;
}

/**
 * The BrainBrew mark.
 *
 * A mint half-disc rising over five short bars. Read one way it is a sun
 * cresting a horizon (morning). Read the other it is the surface of a drink
 * seen edge-on above a saucer (brew). The five bars are the five daily
 * challenges — and they are drawn as the *same* five bars used by the in-session
 * progress indicator, so the logo and the progress bar are literally the same
 * object. Finishing a session fills in the logo.
 *
 * Drawn from Views and border-radius: no SVG dependency, no bitmap asset, and
 * it scales cleanly from an 18px header mark to a 64px splash mark. Deliberately
 * not a cartoon brain.
 */
export function BrewMark({ size = 44, tone = colors.mint }: BrewMarkProps) {
  const discWidth = size * 0.68;
  const discHeight = discWidth / 2;
  const barHeight = Math.max(2, size * 0.055);
  const barGap = Math.max(1.5, size * 0.045);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="BrainBrew"
      style={[styles.root, { width: size, height: size }]}
    >
      <View
        style={{
          width: discWidth,
          height: discHeight,
          borderTopLeftRadius: discWidth,
          borderTopRightRadius: discWidth,
          backgroundColor: tone,
          borderWidth: Math.max(1, size * 0.028),
          borderColor: colors.brandViolet,
          borderBottomWidth: 0,
        }}
      />
      <View style={{ height: size * 0.11 }} />
      <View style={[styles.horizon, { width: size * 0.82, gap: barGap }]}>
        {Array.from({ length: 5 }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: barHeight,
              borderRadius: radius.pill,
              backgroundColor: colors.text,
              // The centre bar reads as "today" without adding a second hue.
              opacity: i === 2 ? 0.9 : 0.32,
            }}
          />
        ))}
      </View>
    </View>
  );
}

interface WordmarkProps {
  size?: number;
  /** Accent applied to "Brew". */
  tone?: string;
}

/** "Brain" in cream, "Brew" in mint. Serif display face, tight tracking. */
export function Wordmark({ size = typography.wordmark.fontSize, tone = colors.mint }: WordmarkProps) {
  return (
    <Text
      accessibilityRole="header"
      style={[typography.wordmark, { fontSize: size, color: colors.text }]}
    >
      Brain<Text style={{ color: tone }}>Brew</Text>
    </Text>
  );
}

interface LogoProps {
  markSize?: number;
  wordSize?: number;
  /** 'row' for headers, 'stack' for the home hero. */
  layout?: 'row' | 'stack';
}

export function Logo({ markSize = 44, wordSize, layout = 'stack' }: LogoProps) {
  const isRow = layout === 'row';
  return (
    <View style={isRow ? styles.row : styles.stack}>
      <BrewMark size={markSize} />
      <Wordmark size={wordSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'flex-end' },
  horizon: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stack: { alignItems: 'flex-start', gap: 14 },
});
