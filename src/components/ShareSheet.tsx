import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { shareText, type ShareSnapshot } from '../cloud/shareSnapshot';
import { useShareCard } from '../cloud/useShareCard';
import { Button } from './Button';
import { ShareCard } from './ShareCard';
import { colors, radius, shadow, spacing, typography } from '../theme/theme';

interface ShareSheetProps {
  snapshot: ShareSnapshot;
  visible: boolean;
  onClose: () => void;
}

/**
 * The share overlay: a live preview of the exact card that will be exported, plus
 * the Share action. It generates the image only on tap, reuses it on repeat taps,
 * and never blocks the Results screen behind it (it's a separate modal). Honest
 * copy per outcome — never claims native sharing where unavailable.
 */
export function ShareSheet({ snapshot, visible, onClose }: ShareSheetProps) {
  const { width } = useWindowDimensions();
  const size = Math.max(240, Math.min(340, width - spacing.lg * 4));
  const ctrl = useShareCard(snapshot.generatedAt, size);
  const [message, setMessage] = useState<string | null>(null);

  const onShare = async () => {
    setMessage(null);
    const out = await ctrl.share(shareText(snapshot), `brainbrew-${snapshot.sessionType}-${snapshot.date}.png`);
    setMessage(
      out === 'shared' ? 'Shared.'
        : out === 'downloaded' ? 'Image saved to your device.'
        : out === 'cancelled' ? null
        : out === 'unsupported' ? 'Sharing isn’t available here — try saving the image.'
        : 'Couldn’t prepare the image. Please try again.',
    );
  };

  const busy = ctrl.phase === 'generating' || ctrl.phase === 'sharing';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Share your Brew</Text>
            <View style={styles.cardWrap}>
              <ShareCard ref={ctrl.ref} snapshot={snapshot} size={size} />
            </View>
            {message && <Text style={styles.message}>{message}</Text>}
            <View style={styles.actions}>
              <Button label={busy ? 'Preparing…' : 'Share Result'} onPress={onShare} disabled={busy} />
              <Button label="Close" variant="secondary" onPress={onClose} disabled={busy} />
            </View>
            <Text style={styles.privacy}>No answers, account, or personal data are included.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,8,16,0.82)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  sheet: {
    width: '100%', maxWidth: 420, maxHeight: '92%',
    borderRadius: radius.xl, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderHighlight, ...shadow.card,
  },
  scroll: { padding: spacing.lg, gap: spacing.md, alignItems: 'center' },
  title: { ...typography.title, fontSize: 20, color: colors.text, alignSelf: 'stretch' },
  cardWrap: { borderRadius: radius.xl, overflow: 'hidden' },
  message: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.sm },
  privacy: { ...typography.caption, fontSize: 11, color: colors.textFaint, textAlign: 'center' },
});
