import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AnimatedMount } from '../components/AnimatedMount';
import { BrewMark } from '../components/brand/BrewMark';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import {
  getUpgradeStatus,
  requestEmailUpgrade,
  type UpgradeStatus,
} from '../cloud/accountUpgrade';
import { colors, MIN_TAP_TARGET, radius, shadow, spacing, typography } from '../theme/theme';

interface SecureProgressScreenProps {
  /** Called when the upgrade is confirmed complete (permanent). */
  onComplete: () => void;
  onBack: () => void;
}

type Step = 'email' | 'sending' | 'sent' | 'conflict' | 'completed' | 'error';

const RESEND_COOLDOWN_MS = 30_000;

/**
 * The "Secure your progress" flow: attach an email to the current anonymous user
 * so the SAME account becomes permanent and recoverable. Passwordless — the
 * player confirms via a link emailed to them; no password is set here. Never
 * claims ranked access. Never reveals whether a conflicting email belongs to a
 * specific person.
 */
export function SecureProgressScreen({ onComplete, onBack }: SecureProgressScreenProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [masked, setMasked] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [checking, setChecking] = useState(false);
  const lastEmail = useRef('');

  const map = (r: { status: UpgradeStatus; code?: string; emailMasked?: string }) => {
    if (r.emailMasked) setMasked(r.emailMasked);
    if (r.status === 'verification_sent') { setStep('sent'); setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS); }
    else if (r.status === 'completed') { setStep('completed'); }
    else if (r.status === 'conflict') { setStep('conflict'); }
    else if (r.status === 'requesting') { /* single-flight; ignore */ }
    else { setStep('error'); setError(errorCopy(r.code)); }
  };

  const submit = useCallback(async () => {
    setError(null);
    setStep('sending');
    lastEmail.current = email;
    map(await requestEmailUpgrade(email));
  }, [email]);

  const resend = useCallback(async () => {
    if (Date.now() < cooldownUntil) return;
    map(await requestEmailUpgrade(lastEmail.current));
  }, [cooldownUntil]);

  const checkConfirmed = useCallback(async () => {
    setChecking(true);
    const r = await getUpgradeStatus();
    setChecking(false);
    if (r.status === 'completed') { setStep('completed'); }
  }, []);

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <AnimatedMount distance={12}>
            <View style={styles.hero}>
              <BrewMark size={40} />
              <Text style={styles.title}>Secure your progress</Text>
            </View>
          </AnimatedMount>

          {step === 'email' && (
            <AnimatedMount distance={12} delay={60}>
              <View style={styles.card}>
                <Text style={styles.body}>
                  Add your email so you can recover this profile and play history on another device later, and be
                  ready for future ranked play. We’ll email you a link to confirm — no password needed.
                </Text>
                <Text style={styles.label}>EMAIL</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  accessibilityLabel="Email address"
                />
                {error && <Text style={styles.errorText}>{error}</Text>}
                <Text style={styles.privacy}>Your email stays private and is never shown on your public card.</Text>
              </View>
            </AnimatedMount>
          )}

          {step === 'sending' && <Loading label="Sending your link…" />}

          {step === 'sent' && (
            <AnimatedMount distance={12}>
              <View style={styles.card}>
                <Text style={styles.body}>
                  We sent a confirmation link to <Text style={styles.strong}>{masked}</Text>. Open it on this device
                  to finish. Keep this screen open, then tap “I’ve confirmed”.
                </Text>
                <Text style={styles.privacy}>The link expires in about an hour.</Text>
                {checking && <ActivityIndicator color={colors.mint} />}
              </View>
            </AnimatedMount>
          )}

          {step === 'conflict' && (
            <AnimatedMount distance={12}>
              <View style={styles.card}>
                <Text style={styles.body}>
                  That email is already connected to another BrainBrew account. Try a different email, or cancel.
                </Text>
              </View>
            </AnimatedMount>
          )}

          {step === 'completed' && (
            <AnimatedMount distance={12}>
              <View style={styles.card}>
                <Text style={[styles.title, styles.success]}>Progress secured</Text>
                <Text style={styles.body}>
                  Your account is now permanent. You can recover it with your email on another device. Your username,
                  country, and play history are unchanged.
                </Text>
              </View>
            </AnimatedMount>
          )}

          {step === 'error' && (
            <AnimatedMount distance={12}>
              <View style={styles.card}>
                <Text style={styles.body}>{error ?? 'Something went wrong. Please try again.'}</Text>
              </View>
            </AnimatedMount>
          )}

          <View style={styles.footer}>
            {step === 'email' && <Button label="Send confirmation link" onPress={submit} disabled={email.length === 0} />}
            {step === 'sent' && (
              <>
                <Button label="I’ve confirmed — continue" onPress={checkConfirmed} disabled={checking} />
                <Button label="Resend link" variant="secondary" onPress={resend} disabled={Date.now() < cooldownUntil} />
                <Button label="Use a different email" variant="secondary" onPress={() => setStep('email')} />
              </>
            )}
            {step === 'conflict' && (
              <>
                <Button label="Use a different email" onPress={() => { setEmail(''); setStep('email'); }} />
                <Button label="Cancel" variant="secondary" onPress={onBack} />
              </>
            )}
            {step === 'completed' && <Button label="Done" onPress={onComplete} />}
            {step === 'error' && (
              <>
                <Button label="Try again" onPress={() => setStep('email')} />
                <Button label="Back" variant="secondary" onPress={onBack} />
              </>
            )}
            {(step === 'email') && <Button label="Not now" variant="secondary" onPress={onBack} />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.mint} />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

function errorCopy(code?: string): string {
  switch (code) {
    case 'email_required': return 'Please enter your email.';
    case 'email_invalid': return 'That doesn’t look like a valid email. Please check it.';
    case 'email_too_long': return 'That email is too long.';
    case 'rate_limited': return 'Too many attempts. Please wait a minute and try again.';
    default: return 'We couldn’t send the link. Please try again.';
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, gap: spacing.lg, paddingVertical: spacing.lg },
  hero: { gap: spacing.sm, alignItems: 'flex-start' },
  title: { ...typography.title, fontSize: 24, color: colors.text },
  success: { color: colors.correct },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    ...shadow.card,
  },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  strong: { color: colors.text, fontWeight: '700' },
  label: { ...typography.label, color: colors.mint },
  input: {
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    ...typography.option,
  },
  errorText: { ...typography.caption, color: colors.incorrect },
  privacy: { ...typography.caption, color: colors.textFaint },
  footer: { gap: spacing.sm, marginTop: 'auto' },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
});
