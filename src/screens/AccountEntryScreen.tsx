import { useCallback, useState } from 'react';
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
import { BrewMark, Wordmark } from '../components/brand/BrewMark';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { requestSignIn, signInWithGoogle } from '../cloud/accountUpgrade';
import { colors, MIN_TAP_TARGET, radius, shadow, spacing, typography } from '../theme/theme';

interface AccountEntryScreenProps {
  /** Start fresh as a new anonymous guest. */
  onContinueAsGuest: () => void;
  /** Re-bootstrap identity after the user confirms a sign-in link. */
  onSignedIn: () => void;
}

type Step = 'choose' | 'email' | 'sent';

/**
 * Shown after a permanent user signs out (Task 11). No anonymous user is created
 * until "Continue as Guest" is chosen. Sign-in restores an EXISTING permanent
 * account — it never merges the (now signed-out) guest into it.
 */
export function AccountEntryScreen({ onContinueAsGuest, onSignedIn }: AccountEntryScreenProps) {
  const [step, setStep] = useState<Step>('choose');
  const [email, setEmail] = useState('');
  const [masked, setMasked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async () => {
    setBusy(true);
    setError(null);
    const r = await requestSignIn(email);
    setBusy(false);
    if (r.status === 'verification_sent') { setMasked(r.emailMasked ?? ''); setStep('sent'); }
    else setError(r.code === 'rate_limited' ? 'Too many attempts. Please wait a minute.' : 'That doesn’t look like a valid email.');
  }, [email]);

  const handleGoogle = useCallback(async () => {
    setBusy(true);
    setError(null);
    const r = await signInWithGoogle();
    setBusy(false);
    // Web redirects to Google now; native returns here. On success the app
    // re-bootstraps into the restored account.
    if (r.status === 'completed' || r.status === 'linked') onSignedIn();
    else if (r.status !== 'opening_provider' && r.status !== 'cancelled') setError('Couldn’t start Google. Please try again.');
  }, [onSignedIn]);

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <AnimatedMount distance={12}>
            <View style={styles.hero}>
              <BrewMark size={48} />
              <Wordmark size={18} />
            </View>
          </AnimatedMount>

          {step === 'choose' && (
            <AnimatedMount distance={12} delay={60}>
              <View style={styles.card}>
                <Text style={styles.title}>Welcome back</Text>
                <Text style={styles.body}>
                  Sign in to restore your saved account, or continue as a new guest. Guest progress stays on this
                  device until you secure it with an email.
                </Text>
                <Button label="Sign in with email" onPress={() => setStep('email')} />
                <Button label="Continue with Google" variant="secondary" onPress={handleGoogle} disabled={busy} />
                <Button label="Continue as guest" variant="secondary" onPress={onContinueAsGuest} />
              </View>
            </AnimatedMount>
          )}

          {step === 'email' && (
            <AnimatedMount distance={12}>
              <View style={styles.card}>
                <Text style={styles.title}>Sign in</Text>
                <Text style={styles.body}>
                  Signing in will switch this device to your existing account. Progress from a current guest profile is
                  not merged.
                </Text>
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
                {error && <Text style={styles.errorText} accessibilityLiveRegion="assertive">{error}</Text>}
                <Button label={busy ? 'Sending…' : 'Send sign-in link'} onPress={send} disabled={busy || email.length === 0} />
                <Button label="Back" variant="secondary" onPress={() => setStep('choose')} />
              </View>
            </AnimatedMount>
          )}

          {step === 'sent' && (
            <AnimatedMount distance={12}>
              <View style={styles.card}>
                <Text style={styles.title}>Check your email</Text>
                <Text style={styles.body}>
                  If <Text style={styles.strong}>{masked}</Text> has a BrainBrew account, we sent a sign-in link. Open
                  it on this device, then continue.
                </Text>
                <Button label="I’ve signed in — continue" onPress={onSignedIn} />
                <Button label="Back" variant="secondary" onPress={() => setStep('choose')} />
              </View>
            </AnimatedMount>
          )}

          {busy && step !== 'sent' && <ActivityIndicator color={colors.mint} accessibilityLabel="Loading" />}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, gap: spacing.xl, justifyContent: 'center', paddingVertical: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.sm },
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
  title: { ...typography.title, fontSize: 22, color: colors.text },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  strong: { color: colors.text, fontWeight: '700' },
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
});
