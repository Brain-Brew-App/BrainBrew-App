import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnimatedMount } from '../components/AnimatedMount';
import { BrewMark, Wordmark } from '../components/brand/BrewMark';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { PREMIUM_PREVIEW, RANKED_FAIRNESS_PROMISE } from '../cloud/entitlements';
import { usePremiumController } from '../cloud/revenuecat/usePremiumController';
import type { ValidEntitlements } from '../cloud/validate';
import { colors, MIN_TAP_TARGET, radius, shadow, spacing, typography } from '../theme/theme';

interface PremiumScreenProps {
  /** The player's server entitlement (from App); the controller refreshes it live. */
  entitlements: ValidEntitlements | null;
  onBack: () => void;
  /** Open Premium Archives — the first real Premium feature (7J). */
  onOpenArchives?: () => void;
  /** The verified Supabase Auth UUID — keys RevenueCat identity + all caches. */
  authUserId?: string | null;
}

const planLabel = (plan: string) => (plan === 'monthly' ? 'Monthly' : plan === 'annual' ? 'Annual' : 'Plan');

/**
 * Premium screen (Phase 7E) — an honest preview that becomes a real sandbox
 * purchase screen ONLY when the native SDK + a store offering are available.
 * Production release policy stays `beta_open`, so everyone keeps unlimited
 * Practice; the store flow is exercised without blocking anyone. No fake prices,
 * no dark patterns, purchasing waits for server-synchronized entitlement.
 */
export function PremiumScreen({ entitlements, onBack, onOpenArchives, authUserId = null }: PremiumScreenProps) {
  const c = usePremiumController(true, authUserId);
  const ent = c.entitlement ?? entitlements;

  // Adapter over the state machine. Premium is NEVER unlocked by an SDK result —
  // only `ready_premium` (server-confirmed) counts. Cancellation is neutral copy.
  const busyStates = ['purchasing', 'restoring', 'finalizing'];
  const p = {
    supported: c.supported,
    unavailableReason: c.offeringError,
    offering: c.offering,
    entitlement: c.entitlement,
    busy: busyStates.includes(c.state),
    finalizing: c.state === 'finalizing',
    purchase: (plan: 'monthly' | 'annual' | 'other') => { if (plan !== 'other') c.purchase(plan); },
    restore: c.restore,
    message: ((): string | null => {
      switch (c.state) {
        case 'cancelled': return 'Purchase cancelled — nothing was charged.';
        case 'nothing_to_restore': return 'No previous purchase was found on this store account.';
        case 'conflict': return 'That purchase belongs to a different BrainBrew account. Sign in with that account, or contact support — we never merge accounts automatically.';
        case 'store_unavailable': return 'The store is unavailable right now. Please try again shortly.';
        case 'network_error': return 'We couldn’t reach the server. Check your connection and try again.';
        case 'error': return 'Something went wrong. Please try again.';
        default: return null;
      }
    })(),
  };
  const syncDelayed = c.state === 'sync_delayed';
  const state = ent?.entitlementState ?? 'beta';
  const betaOpen = (ent?.policyMode ?? 'beta_open') === 'beta_open';
  const isPremium = ['premium', 'grace_period', 'billing_issue'].includes(state);

  const statusLine = (() => {
    if (state === 'grace_period') return 'Your subscription is in a grace period.';
    if (state === 'billing_issue') return 'There may be an issue with your subscription. Manage it through your app store.';
    if (state === 'premium') return p.entitlement?.subscription?.willRenew === false ? 'Premium active — will not renew.' : 'Premium active.';
    if (state === 'expired') return 'Premium has expired. Your scores and history are safe.';
    if (state === 'revoked') return 'Your subscription was refunded. Your scores and history are safe.';
    return null;
  })();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AnimatedMount distance={10}>
          <View style={styles.brandRow}><BrewMark size={20} /><Wordmark size={16} /></View>
        </AnimatedMount>

        <AnimatedMount distance={12}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>BRAINBREW PREMIUM</Text>
            <Text style={styles.title}>{isPremium ? 'You’re Premium' : 'Coming later'}</Text>
            <Text style={styles.heroBody}>
              An optional way to get more out of Practice and personal insights. The daily ranked
              Brew and everything you play today stays free — Premium only ever adds extras.
            </Text>
            {statusLine && <View style={styles.statusPill}><Text style={styles.statusPillText}>{statusLine}</Text></View>}
            {betaOpen && !isPremium && (
              <View style={styles.betaPill}><Text style={styles.betaPillText}>Unlimited Practice is currently included for all beta players.</Text></View>
            )}
          </View>
        </AnimatedMount>

        <AnimatedMount distance={12} delay={60}>
          <View style={styles.fairnessCard}>
            <Text style={styles.fairnessTitle}>Fair play, always</Text>
            <Text style={styles.fairnessBody}>{RANKED_FAIRNESS_PROMISE}</Text>
          </View>
        </AnimatedMount>

        {/* Purchase section — only when the store offering is live on this device. */}
        {p.supported && p.offering && !isPremium && (
          <AnimatedMount distance={12} delay={100}>
            <View style={styles.purchaseCard}>
              <Text style={styles.listHeading}>Choose a plan</Text>
              {p.offering.packages.map((pkg) => (
                <Pressable
                  key={pkg.packageId}
                  style={({ pressed }) => [styles.planRow, pressed && styles.planRowPressed]}
                  onPress={() => p.purchase(pkg.plan)}
                  disabled={p.busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Subscribe ${planLabel(pkg.plan)} for ${pkg.priceString}`}
                >
                  <View>
                    <Text style={styles.planName}>{planLabel(pkg.plan)}</Text>
                    {pkg.hasIntroOffer && <Text style={styles.planIntro}>Includes an introductory offer</Text>}
                  </View>
                  <Text style={styles.planPrice}>{pkg.priceString}</Text>
                </Pressable>
              ))}
              <Text style={styles.renewNote}>
                Subscriptions renew automatically unless cancelled at least 24 hours before the period
                ends. Manage or cancel anytime in your app store account settings.
              </Text>
              <Button label="Restore purchases" variant="secondary" onPress={p.restore} disabled={p.busy} />
            </View>
          </AnimatedMount>
        )}

        {/* Unsupported / unavailable — a calm state, never a broken button. */}
        {(!p.supported || (!p.offering && !isPremium)) && (
          <AnimatedMount distance={12} delay={100}>
            <View style={styles.unavailableCard}>
              <Text style={styles.unavailableText}>
                {p.unavailableReason === 'unsupported_platform'
                  ? 'Subscriptions are managed in the BrainBrew mobile app. On the web, you keep full beta access.'
                  : 'Plans aren’t available right now. You keep full beta access in the meantime.'}
              </Text>
              {p.supported && <Button label="Restore purchases" variant="secondary" onPress={p.restore} disabled={p.busy} />}
            </View>
          </AnimatedMount>
        )}

        {/* Archives — the first real Premium feature. Server-confirmed Premium only. */}
        {isPremium && onOpenArchives && (
          <AnimatedMount distance={12} delay={90}>
            <View style={styles.purchaseCard}>
              <Text style={styles.listHeading}>Archives</Text>
              <Text style={styles.renewNote}>Replay any past Daily Brew. Archive Brews are always unranked.</Text>
              <Button label="Open Archives" onPress={onOpenArchives} />
            </View>
          </AnimatedMount>
        )}

        {/*
          Live region: these are PURCHASE outcomes — "Purchase cancelled", "that
          purchase belongs to a different account", "Finalizing access…". They were
          announced to nobody. Money errors must never be silent.
        */}
        {(p.busy || p.finalizing || p.message) && (
          <View style={styles.statusRow} accessibilityLiveRegion="assertive">
            {(p.busy || p.finalizing) && <ActivityIndicator color={colors.mint} accessibilityLabel="Loading" />}
            {p.finalizing && <Text style={styles.finalizing}>Finalizing access…</Text>}
            {p.message && <Text style={styles.message}>{p.message}</Text>}
          </View>
        )}

        {/* A delayed webhook is NEVER a failed purchase — offer safe recovery. */}
        {syncDelayed && (
          <AnimatedMount distance={12}>
            <View style={styles.unavailableCard}>
              <Text style={styles.unavailableText}>
                Your purchase was received, but access is still being finalized. You have not been charged twice —
                do not buy again.
              </Text>
              <Button label="Retry sync" onPress={c.retrySync} />
              <Button label="Restore purchases" variant="secondary" onPress={c.restore} />
              {c.diagnosticRef && <Text style={styles.message}>Support reference: {c.diagnosticRef}</Text>}
            </View>
          </AnimatedMount>
        )}

        <AnimatedMount distance={12} delay={140}>
          <View style={styles.list}>
            <Text style={styles.listHeading}>What’s planned</Text>
            {PREMIUM_PREVIEW.map((b) => {
              const included = b.includedInBeta && Boolean(ent?.capabilities[b.capability]);
              return (
                <View key={b.capability} style={styles.benefitRow}>
                  <View style={styles.benefitHead}>
                    <Text style={styles.benefitTitle}>{b.title}</Text>
                    <Text style={[styles.benefitTag, included ? styles.tagIncluded : styles.tagLater]}>
                      {included ? 'Included in beta' : 'Later'}
                    </Text>
                  </View>
                  <Text style={styles.benefitBlurb}>{b.blurb}</Text>
                </View>
              );
            })}
          </View>
        </AnimatedMount>

        <View style={styles.footer}><Button label="Back" variant="secondary" onPress={onBack} /></View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: spacing.lg, paddingVertical: spacing.lg },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hero: {
    gap: spacing.sm, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderHighlight, ...shadow.card,
  },
  eyebrow: { ...typography.label, color: colors.gold },
  title: { ...typography.title, color: colors.text },
  heroBody: { ...typography.caption, color: colors.textMuted, lineHeight: 20 },
  statusPill: {
    alignSelf: 'flex-start', marginTop: spacing.xs, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.gold,
  },
  statusPillText: { ...typography.caption, color: colors.gold, fontWeight: '600' },
  betaPill: {
    alignSelf: 'flex-start', marginTop: spacing.xs, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.mint,
  },
  betaPillText: { ...typography.caption, color: colors.mint, fontWeight: '600' },
  fairnessCard: {
    gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceRaised,
    borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.mint,
  },
  fairnessTitle: { ...typography.option, fontWeight: '700', color: colors.text },
  fairnessBody: { ...typography.caption, color: colors.textMuted, lineHeight: 20 },
  purchaseCard: {
    gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderTopColor: colors.borderHighlight, ...shadow.card,
  },
  planRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: MIN_TAP_TARGET, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised,
  },
  planRowPressed: { borderColor: colors.mint, backgroundColor: colors.floating },
  planName: { ...typography.option, fontWeight: '700', color: colors.text },
  planIntro: { ...typography.caption, color: colors.mint },
  planPrice: { ...typography.option, fontWeight: '700', color: colors.mint },
  renewNote: { ...typography.caption, color: colors.textFaint, lineHeight: 18 },
  unavailableCard: {
    gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border,
  },
  unavailableText: { ...typography.caption, color: colors.textMuted, lineHeight: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  finalizing: { ...typography.option, color: colors.mint, fontWeight: '600' },
  message: { ...typography.caption, color: colors.textMuted, flexShrink: 1, lineHeight: 18 },
  list: { gap: spacing.md },
  listHeading: { ...typography.label, color: colors.textFaint },
  benefitRow: { gap: spacing.xs, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  benefitHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  benefitTitle: { ...typography.option, fontWeight: '600', color: colors.text, flexShrink: 1 },
  benefitTag: { ...typography.label, fontSize: 10, paddingVertical: 2, paddingHorizontal: spacing.sm, borderRadius: radius.pill, overflow: 'hidden' },
  tagIncluded: { color: colors.textInverse, backgroundColor: colors.mint },
  tagLater: { color: colors.textFaint, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  benefitBlurb: { ...typography.caption, color: colors.textMuted, lineHeight: 19 },
  footer: { gap: spacing.sm, marginTop: 'auto' },
});
