import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
  type Profile,
} from '../cloud/profileApi';
import { getLinkedMethods, linkGoogle } from '../cloud/accountUpgrade';
import type { LinkedMethods } from '../cloud/identities';
import { colors, MIN_TAP_TARGET, radius, shadow, spacing, typography } from '../theme/theme';

interface ProfileScreenProps {
  profile: Profile;
  onBack: () => void;
  /** Called after a successful edit so the parent can refresh the profile. */
  onChanged: () => void;
  /** Guest only: open the "Secure your progress" email-upgrade flow. */
  onSecureProgress: () => void;
  /** Permanent only: sign out (confirmed) → account entry. */
  onSignOut: () => void;
  /** Open the Premium preview (what's planned) — no purchasing. */
  onOpenPremium: () => void;
}

/**
 * The minimal player card (Phase 5B, Task 13): username, country, account status,
 * and edit affordances. Anonymous users are NOT shown a Sign Out button — an
 * anonymous account cannot be signed back into, so signing out would orphan their
 * progress. "Secure your progress" is a status row only; linking arrives later.
 */
export function ProfileScreen({ profile, onBack, onChanged, onSecureProgress, onSignOut, onOpenPremium }: ProfileScreenProps) {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [editing, setEditing] = useState<null | 'username' | 'country'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [methods, setMethods] = useState<LinkedMethods | null>(null);
  const [opening, setOpening] = useState(false);

  const [name, setName] = useState(profile.username ?? '');
  const [query, setQuery] = useState('');

  useEffect(() => {
    listCountries().then(setCountries).catch(() => setCountries([]));
    getLinkedMethods().then(setMethods).catch(() => setMethods(null));
  }, []);

  const handleLinkGoogle = async () => {
    setOpening(true);
    setErr(null);
    const r = await linkGoogle();
    setOpening(false);
    // On web the browser redirects to Google now; on native the flow returns here.
    if (r.status === 'linked') onChanged();
    else if (r.status === 'conflict') setErr('That Google account is already connected to another BrainBrew account.');
    else if (r.status === 'error') setErr('Couldn’t start Google. Please try again.');
    // 'opening_provider' -> the browser is navigating; nothing else to do.
  };

  const countryName = countries.find((c) => c.code === profile.country_code)?.name ?? profile.country_code ?? '—';
  const isGuest = profile.account_type === 'anonymous';

  const saveUsername = async () => {
    setBusy(true);
    setErr(null);
    try {
      const avail = await checkUsername(name);
      if (!avail.available && name.toLowerCase() !== (profile.username ?? '').toLowerCase()) {
        setErr(avail.reason === 'username_taken' ? 'That name is taken.' : 'That name isn’t allowed.');
        setBusy(false);
        return;
      }
      await setUsername(name);
      setEditing(null);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error && e.message === 'username_taken' ? 'That name was just taken.' : 'Couldn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveCountry = async (code: string) => {
    setBusy(true);
    setErr(null);
    try {
      await setCountry(code, profile.display_country);
      setEditing(null);
      onChanged();
    } catch {
      setErr('Couldn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const filtered = query
    ? countries.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : countries;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <AnimatedMount distance={10}>
          <View style={styles.brandRow}>
            <BrewMark size={20} />
            <Wordmark size={16} />
          </View>
        </AnimatedMount>

        <AnimatedMount distance={12}>
          <View style={styles.card}>
            <Text style={styles.eyebrow}>PLAYER CARD</Text>

            {/* Username */}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Username</Text>
              {editing === 'username' ? (
                <View style={styles.editWrap}>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={20}
                    accessibilityLabel="Edit username"
                  />
                  <Button label={busy ? 'Saving…' : 'Save'} onPress={saveUsername} disabled={busy} />
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit username, currently ${profile.username ?? 'not set'}`}
                  style={styles.valueRow}
                  onPress={() => { setName(profile.username ?? ''); setEditing('username'); }}
                >
                  <Text style={styles.value}>{profile.username ?? 'Not set'}</Text>
                  <Text style={styles.edit}>Edit</Text>
                </Pressable>
              )}
            </View>

            {/* Country */}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Country</Text>
              {editing === 'country' ? (
                <View style={styles.editWrap}>
                  <TextInput
                    style={styles.input}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search"
                    placeholderTextColor={colors.textFaint}
                    accessibilityLabel="Search countries"
                  />
                  <View style={styles.countryList}>
                    {filtered.slice(0, 6).map((c) => (
                      <Pressable key={c.code} style={styles.countryRow} onPress={() => saveCountry(c.code)}>
                        <Text style={styles.countryName}>{c.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit country, currently ${countryName}`}
                  style={styles.valueRow}
                  onPress={() => setEditing('country')}
                >
                  <Text style={styles.value}>{countryName}</Text>
                  <Text style={styles.edit}>Edit</Text>
                </Pressable>
              )}
            </View>

            {/* Account status */}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Account</Text>
              <Text style={styles.value}>{isGuest ? 'Guest' : 'Permanent'}</Text>
            </View>

            {err && <Text style={styles.errorText} accessibilityLiveRegion="assertive">{err}</Text>}
          </View>
        </AnimatedMount>

        <AnimatedMount distance={12} delay={80}>
          <View style={styles.secureCard}>
            <Text style={styles.secureTitle}>{isGuest ? 'Secure your progress' : 'Recovery methods'}</Text>
            {isGuest ? (
              <>
                <Text style={styles.secureBody}>
                  Your progress currently lives in this guest session on this device. Add a recovery method to make
                  your account permanent — restore it on another device, protect your card and play history, and be
                  ready for future ranked play.
                </Text>
                <Button label="Secure with email" onPress={onSecureProgress} disabled={opening} />
                <Button label="Continue with Google" variant="secondary" onPress={handleLinkGoogle} disabled={opening} />
              </>
            ) : (
              <>
                <View style={styles.methodRow}>
                  <Text style={[styles.methodMark, methods?.email && styles.methodOn]}>{methods?.email ? '✓' : '○'}</Text>
                  <Text style={styles.methodLabel}>Email</Text>
                </View>
                <View style={styles.methodRow}>
                  <Text style={[styles.methodMark, methods?.google && styles.methodOn]}>{methods?.google ? '✓' : '○'}</Text>
                  <Text style={styles.methodLabel}>Google</Text>
                </View>
                {methods && !methods.google && (
                  <Button label="Add Google" variant="secondary" onPress={handleLinkGoogle} disabled={opening} />
                )}
                <Text style={styles.secureBody}>
                  Your account is permanent and can be restored with any linked method on another device.
                </Text>
              </>
            )}
            {opening && <ActivityIndicator color={colors.mint} accessibilityLabel="Loading" />}
          </View>
        </AnimatedMount>

        <AnimatedMount distance={12} delay={140}>
          <View style={styles.premiumCard}>
            <Text style={styles.premiumEyebrow}>BRAINBREW PREMIUM · COMING LATER</Text>
            <Text style={styles.premiumBody}>
              A future, optional upgrade for more Practice and deeper insights. Unlimited Practice is
              included for everyone during beta. Premium will never provide extra ranked attempts —
              the daily Brew is one attempt a day for everyone.
            </Text>
            <Button label="Learn what’s planned" variant="secondary" onPress={onOpenPremium} />
          </View>
        </AnimatedMount>

        <View style={styles.footer}>
          <Button label="Back" variant="secondary" onPress={onBack} />
          {/* Sign out only for PERMANENT accounts — a guest can't sign back in. */}
          {!isGuest && !confirmSignOut && (
            <Button label="Sign out" variant="secondary" onPress={() => setConfirmSignOut(true)} />
          )}
          {!isGuest && confirmSignOut && (
            <View style={styles.signOutConfirm}>
              <Text style={styles.secureBody}>
                Sign out of this device? Your account and cloud data are kept — you can sign back in with your email.
                Local session data on this device will be cleared.
              </Text>
              <Button label="Sign out" onPress={onSignOut} />
              <Button label="Cancel" variant="secondary" onPress={() => setConfirmSignOut(false)} />
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: spacing.lg, paddingVertical: spacing.lg },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  eyebrow: { ...typography.label, color: colors.mint },
  row: { gap: spacing.xs },
  rowLabel: { ...typography.caption, color: colors.textFaint },
  valueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: MIN_TAP_TARGET },
  value: { ...typography.option, fontWeight: '600', color: colors.text },
  edit: { ...typography.caption, color: colors.mint },
  editWrap: { gap: spacing.sm },
  input: {
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    ...typography.option,
  },
  countryList: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  countryRow: { minHeight: MIN_TAP_TARGET, justifyContent: 'center', paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  countryName: { ...typography.option, color: colors.text },
  errorText: { ...typography.caption, color: colors.incorrect },
  secureCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  premiumCard: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: colors.borderHighlight,
    ...shadow.card,
  },
  premiumEyebrow: { ...typography.label, fontSize: 11, color: colors.gold },
  premiumBody: { ...typography.caption, color: colors.textMuted, lineHeight: 20 },
  secureTitle: { ...typography.option, fontWeight: '700', color: colors.text },
  secureBody: { ...typography.caption, color: colors.textMuted, lineHeight: 20 },
  signOutConfirm: { gap: spacing.sm },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  methodMark: { width: 18, textAlign: 'center', fontSize: 16, color: colors.textFaint },
  methodOn: { color: colors.correct, fontWeight: '700' },
  methodLabel: { ...typography.option, color: colors.text },
  footer: { gap: spacing.sm, marginTop: 'auto' },
});
