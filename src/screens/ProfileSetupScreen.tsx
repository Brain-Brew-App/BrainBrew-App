import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import {
  checkUsername,
  listCountries,
  setCountry,
  setUsername,
  type CountryOption,
} from '../cloud/profileApi';
import { colors, MIN_TAP_TARGET, radius, shadow, spacing, typography } from '../theme/theme';

interface ProfileSetupScreenProps {
  /** Called once username + country are saved and onboarding is complete. */
  onDone: () => void;
}

const USERNAME_RE = /^[A-Za-z0-9]+(_[A-Za-z0-9]+)*$/;
const USERNAME_HELP = '3–20 letters, numbers, or single underscores. No leading, trailing, or double underscores.';

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

/**
 * The one-time profile setup: pick a public username and a country. This is NOT
 * account registration — progress is saved to this guest session on this device;
 * linking a permanent account comes later. No Supabase terminology is shown.
 */
export function ProfileSetupScreen({ onDone }: ProfileSetupScreenProps) {
  const [username, setName] = useState('');
  const [availability, setAvailability] = useState<Availability>('idle');
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [countryCode, setCode] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listCountries().then(setCountries).catch(() => setCountries([]));
  }, []);

  const localValid = username.length >= 3 && username.length <= 20 && USERNAME_RE.test(username);

  // Debounced availability check.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!username) return setAvailability('idle');
    if (!localValid) return setAvailability('invalid');
    setAvailability('checking');
    debounce.current = setTimeout(async () => {
      try {
        const r = await checkUsername(username);
        setAvailability(r.available ? 'available' : r.reason === 'username_taken' ? 'taken' : 'invalid');
      } catch {
        setAvailability('idle');
      }
    }, 450);
    return () => {
      if (debounce.current != null) clearTimeout(debounce.current);
    };
  }, [username, localValid]);

  const canSubmit = localValid && availability !== 'taken' && countryCode != null && !submitting;

  const submit = useCallback(async () => {
    if (!canSubmit || countryCode == null) return;
    setSubmitting(true);
    setError(null);
    try {
      // Claim the username first — the DB constraint settles any race here.
      await setUsername(username);
      await setCountry(countryCode, true);
      onDone();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'profile_error';
      if (code === 'username_taken') {
        setAvailability('taken');
        setError('That name was just taken. Please choose another.');
      } else if (code === 'username_not_allowed') {
        setError('That name isn’t available. Please choose another.');
      } else {
        setError('Something went wrong saving your profile. Please try again.');
      }
      setSubmitting(false);
    }
  }, [canSubmit, countryCode, username, onDone]);

  const filtered = query
    ? countries.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.code === query.toUpperCase())
    : countries;

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <AnimatedMount distance={12}>
            <View style={styles.hero}>
              <BrewMark size={40} />
              <Wordmark size={18} />
              <Text style={styles.title}>Set up your player card</Text>
              <Text style={styles.subtitle}>
                Choose a name and country. Your progress is saved to this device for now — you’ll be able to
                secure it with a permanent account later.
              </Text>
            </View>
          </AnimatedMount>

          <AnimatedMount distance={12} delay={60}>
            <View style={styles.field}>
              <Text style={styles.label}>USERNAME</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setName}
                placeholder="e.g. quick_fox"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                accessibilityLabel="Choose a username"
              />
              <Text style={[styles.help, availabilityColor(availability)]}>{availabilityText(availability) ?? USERNAME_HELP}</Text>
            </View>
          </AnimatedMount>

          <AnimatedMount distance={12} delay={120}>
            <View style={styles.field}>
              <Text style={styles.label}>COUNTRY</Text>
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="Search countries"
                placeholderTextColor={colors.textFaint}
                autoCorrect={false}
                accessibilityLabel="Search countries"
              />
              <View style={styles.countryList}>
                {filtered.slice(0, 8).map((c) => (
                  <Pressable
                    key={c.code}
                    accessibilityRole="button"
                    accessibilityState={{ selected: countryCode === c.code }}
                    onPress={() => setCode(c.code)}
                    style={[styles.countryRow, countryCode === c.code && styles.countrySelected]}
                  >
                    <Text style={styles.countryName}>{c.name}</Text>
                    {countryCode === c.code && <Text style={styles.check}>✓</Text>}
                  </Pressable>
                ))}
                {filtered.length === 0 && <Text style={styles.help}>No matches.</Text>}
              </View>
            </View>
          </AnimatedMount>

          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <View style={styles.footer}>
            <Button label={submitting ? 'Saving…' : 'Continue'} onPress={submit} disabled={!canSubmit} />
            {submitting && <ActivityIndicator color={colors.mint} style={styles.spinner} />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function availabilityText(a: Availability): string | null {
  switch (a) {
    case 'checking': return 'Checking availability…';
    case 'available': return 'That name is available.';
    case 'taken': return 'That name is taken.';
    case 'invalid': return USERNAME_HELP;
    default: return null;
  }
}
function availabilityColor(a: Availability) {
  if (a === 'available') return { color: colors.correct };
  if (a === 'taken' || a === 'invalid') return { color: colors.incorrect };
  return { color: colors.textMuted };
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, gap: spacing.lg, paddingVertical: spacing.lg },
  hero: { gap: spacing.sm },
  title: { ...typography.title, fontSize: 24, color: colors.text, marginTop: spacing.sm },
  subtitle: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
  field: { gap: spacing.sm },
  label: { ...typography.label, color: colors.mint },
  input: {
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    backgroundColor: colors.surface,
    color: colors.text,
    ...typography.option,
  },
  help: { ...typography.caption },
  countryList: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  countryRow: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  countrySelected: { backgroundColor: colors.surfaceRaised },
  countryName: { ...typography.option, color: colors.text },
  check: { color: colors.correct, fontSize: 16, fontWeight: '700' },
  errorText: { ...typography.caption, color: colors.incorrect, textAlign: 'center' },
  footer: { gap: spacing.sm, marginTop: 'auto' },
  spinner: { marginTop: spacing.xs },
});
