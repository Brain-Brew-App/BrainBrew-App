import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CategoryMark } from './brand/CategoryMark';
import type { ShareSnapshot } from '../cloud/shareSnapshot';
import { formatSolveTime } from '../cloud/validate';
import { CATEGORY_ACCENTS, colors } from '../theme/theme';
import { CATEGORY_LABELS, type Category } from '../types/puzzle';

interface ShareCardProps {
  snapshot: ShareSnapshot;
  /** Logical square size; internals scale proportionally. Capture upscales via pixelRatio. */
  size?: number;
}

const GOLD_SCORE = 85;
const STATE_GLYPH: Record<string, string> = { correct: '✓', partial: '◐', missed: '·' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : iso;
}

/**
 * The privacy-safe daily/practice result card, ready for image export. It renders
 * ONLY the frozen `ShareSnapshot` — no answers, prompts, ids, or identity — so the
 * captured image cannot leak them. Fully self-contained (fixed navy surface, cream
 * type, category progression, gold only for a genuine high score/streak) so it
 * reads at any preview size and captures identically regardless of viewport.
 */
export const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard({ snapshot, size = 340 }, ref) {
  const k = size / 340; // proportional scale
  const gold = snapshot.brewScore >= GOLD_SCORE;
  const ranked = snapshot.sessionType === 'ranked';

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width: size, height: size, padding: 24 * k, borderRadius: 28 * k }]}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={[styles.mark, { width: 22 * k, height: 22 * k, borderRadius: 6 * k }]}>
            <Text style={{ fontSize: 13 * k, fontWeight: '800', color: colors.background }}>B</Text>
          </View>
          <Text style={[styles.wordmark, { fontSize: 15 * k }]}>Brain<Text style={{ color: colors.mint }}>Brew</Text></Text>
        </View>
        <Text style={[styles.date, { fontSize: 12 * k }]}>{fmtDate(snapshot.date).toUpperCase()} · UTC</Text>
      </View>

      <View style={[styles.chip, { borderColor: ranked ? colors.mint : colors.border, paddingHorizontal: 10 * k, paddingVertical: 4 * k, borderRadius: 999 }]}>
        <Text style={[styles.chipText, { fontSize: 11 * k, color: ranked ? colors.mint : colors.textMuted }]}>
          {ranked ? 'RANKED BREW' : 'PRACTICE BREW · UNRANKED'}
        </Text>
      </View>

      <View style={styles.center}>
        <View style={styles.scoreRow}>
          <Text style={[styles.score, { fontSize: 92 * k, lineHeight: 96 * k, color: gold ? colors.gold : colors.text }]}>{snapshot.brewScore}</Text>
          <Text style={[styles.scoreMax, { fontSize: 26 * k }]}>/ 100</Text>
        </View>
        <Text style={[styles.caption, { fontSize: 17 * k, color: gold ? colors.gold : colors.violet }]}>{snapshot.caption}</Text>
      </View>

      <View style={styles.cats}>
        {snapshot.categories.map((c) => (
          <View key={c.category} style={styles.cat}>
            <CategoryMark category={c.category as Category} size={20 * k} />
            <Text
              style={[styles.catState, { fontSize: 14 * k, color: c.state === 'correct' ? CATEGORY_ACCENTS[c.category as Category] : c.state === 'partial' ? colors.textMuted : colors.textFaint }]}
              accessibilityLabel={`${CATEGORY_LABELS[c.category as Category]}: ${c.state}, ${c.points} of 20`}
            >
              {STATE_GLYPH[c.state]}
            </Text>
            <Text style={[styles.catPts, { fontSize: 11 * k }]}>{c.points}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        {ranked && snapshot.streak != null && snapshot.streak > 0 ? (
          <Text style={[styles.streak, { fontSize: 13 * k, color: snapshot.streak >= 7 ? colors.gold : colors.textMuted }]}>
            {snapshot.streak}-day ranked streak{snapshot.totalSolveMs != null ? `  ·  ${formatSolveTime(snapshot.totalSolveMs)}` : ''}
          </Text>
        ) : (
          <Text style={[styles.streak, { fontSize: 13 * k }]}>
            {snapshot.totalSolveMs != null ? formatSolveTime(snapshot.totalSolveMs) + ' of solving' : ''}
          </Text>
        )}
        <Text style={[styles.tagline, { fontSize: 13 * k }]}>Five minutes. Sharper every morning.</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.background, justifyContent: 'space-between', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontWeight: '800', color: colors.text },
  date: { color: colors.textFaint, letterSpacing: 0.5, fontWeight: '700' },

  chip: { alignSelf: 'flex-start', borderWidth: 1, backgroundColor: colors.surface },
  chipText: { fontWeight: '800', letterSpacing: 0.8 },

  center: { alignItems: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  score: { fontWeight: '800' },
  scoreMax: { color: colors.textFaint, fontWeight: '600' },
  caption: { fontWeight: '700', marginTop: 2, textAlign: 'center' },

  cats: { flexDirection: 'row', justifyContent: 'space-between' },
  cat: { alignItems: 'center', gap: 4, flex: 1 },
  catState: { fontWeight: '800' },
  catPts: { color: colors.textFaint, fontWeight: '600' },

  footer: { gap: 4 },
  streak: { fontWeight: '700', color: colors.textMuted, textAlign: 'center' },
  tagline: { color: colors.textFaint, textAlign: 'center', fontStyle: 'italic' },
});
