import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CATEGORY_ACCENTS, colors, spacing, typography } from '../theme/theme';
import { CATEGORY_LABELS, type Category } from '../types/puzzle';
import { CategoryMark } from './brand/CategoryMark';

interface PuzzleFrameProps {
  category: Category;
  engine: string;
  prompt: string;
  /** Optional slot on the prompt row, e.g. the Attention Speed countdown. */
  accessory?: ReactNode;
  children: ReactNode;
}

/**
 * Category motif + eyebrow + prompt, above whatever the engine renders.
 * The accent is the category's step on the mint → violet ramp; everything else
 * stays in the shared navy/cream system, so five puzzles read as one app.
 */
export function PuzzleFrame({ category, engine, prompt, accessory, children }: PuzzleFrameProps) {
  const accent = CATEGORY_ACCENTS[category];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <View style={styles.eyebrowRow}>
            <CategoryMark category={category} size={14} />
            <Text style={[styles.eyebrow, { color: accent }]}>
              {CATEGORY_LABELS[category].toUpperCase()} · {engine}
            </Text>
          </View>
          <Text style={styles.prompt}>{prompt}</Text>
        </View>
        {accessory}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  headerText: { flex: 1 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eyebrow: { ...typography.label, flex: 1 },
  prompt: { ...typography.prompt, color: colors.text, marginTop: spacing.sm },
  /**
   * Top-anchored, not centred. Centring floated the content into the middle of
   * the screen and then yanked it upward the moment the reveal card mounted.
   */
  body: { flex: 1, marginTop: spacing.xl },
});
