import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View } from 'react-native';

import { AnimatedMount } from './src/components/AnimatedMount';
import { DevPackSwitcher } from './src/components/DevPackSwitcher';
import { StatusView } from './src/components/StatusView';
import { LaunchIntro } from './src/components/brand/LaunchIntro';
import { isCloudMode } from './src/cloud/env';
import { useCloudIdentity } from './src/cloud/useCloudIdentity';
import { useEntitlements } from './src/cloud/useEntitlements';
import { useMyRankSummary } from './src/cloud/useLeaderboard';
import { useProgressSummary } from './src/cloud/useProgress';
import { DEV_ENABLED, PACK_COUNT } from './src/data/dailyPack';
import { useGameplaySession } from './src/data/useGameplaySession';
import { AccountEntryScreen } from './src/screens/AccountEntryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { PremiumScreen } from './src/screens/PremiumScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ProfileSetupScreen } from './src/screens/ProfileSetupScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { SecureProgressScreen } from './src/screens/SecureProgressScreen';
import { SessionScreen } from './src/screens/SessionScreen';
import { duration } from './src/theme/motion';
import { colors } from './src/theme/theme';

/**
 * App shell. A single `useGameplaySession` drives BOTH local and cloud modes
 * through the same GameplayService, so the screens never branch on the mode.
 * The view is chosen from the session phase; the dev pack switcher appears only
 * in a local development build.
 */
export default function App() {
  const cloud = isCloudMode();
  const [launched, setLaunched] = useState(false);
  const [devPackIndex, setDevPackIndex] = useState<number | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showSecure, setShowSecure] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const identity = useCloudIdentity(cloud);
  const session = useGameplaySession(devPackIndex);
  const { phase, status, puzzle, outcome, score, error, busy, mode, position, ranked, actions } = session;

  // The daily rank summary loads ONLY when there is a completed ranked result to
  // compare — never as part of the critical Home/pack path (Task 12). It is
  // cache-first and non-blocking.
  const hasRankedResult = cloud && ((phase === 'completed' && ranked) || status?.ranked?.state === 'completed');
  const rankSummary = useMyRankSummary(Boolean(hasRankedResult));

  // The streak/habit summary loads for a permanent player once identity is ready,
  // AFTER the core Home/pack/ranked-status path — non-blocking and cache-first, so
  // it never slows first paint (Phase 6B fast path preserved).
  const enableProgress = cloud && identity.phase === 'ready' && identity.profile?.account_type === 'permanent';
  const progressSummary = useProgressSummary(Boolean(enableProgress));

  // Entitlements power the Premium-preview surfaces only — never the play path.
  // Cache-first and loaded lazily once the Premium screen is opened.
  const entitlements = useEntitlements(cloud && identity.phase === 'ready' && showPremium);

  const showDev = DEV_ENABLED && mode === 'local';
  const devTools =
    showDev && status?.packId != null && status.packIndex != null ? (
      <DevPackSwitcher
        index={status.packIndex}
        count={PACK_COUNT}
        packId={status.packId}
        difficulty={(status.difficultyLabel as 'easier' | 'standard' | 'harder') ?? 'standard'}
        isToday={devPackIndex === null}
        onReset={() => setDevPackIndex(null)}
        onChange={(next) => setDevPackIndex(((next % PACK_COUNT) + PACK_COUNT) % PACK_COUNT)}
      />
    ) : undefined;

  const body = () => {
    if (!launched) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <LaunchIntro onFinish={() => setLaunched(true)} />
        </View>
      );
    }

    // --- Cloud identity + profile gate (before any gameplay UI) ---
    if (cloud) {
      if (identity.phase === 'loading') return <StatusView title="Setting up your brew…" loading />;
      if (identity.phase === 'error') {
        return (
          <StatusView
            title={identity.error?.title ?? 'Connection lost'}
            body={identity.error?.body ?? 'We couldn’t reach the server. Please try again.'}
            onPrimary={identity.retry}
            primaryLabel="Try again"
          />
        );
      }
      if (identity.phase === 'account_entry') {
        return (
          <AccountEntryScreen
            onContinueAsGuest={identity.continueAsGuest}
            onSignedIn={identity.continueAsGuest}
          />
        );
      }
      if (identity.phase === 'onboarding') {
        return <ProfileSetupScreen onDone={identity.refresh} />;
      }
      // identity.phase === 'ready' → progress / leaderboard / profile / secure overlays, else gameplay.
      if (showProgress) {
        return <ProgressScreen onBack={() => setShowProgress(false)} onViewLeaderboards={() => { setShowProgress(false); setShowLeaderboard(true); }} />;
      }
      if (showLeaderboard) {
        return <LeaderboardScreen onBack={() => setShowLeaderboard(false)} />;
      }
      if (showPremium) {
        return <PremiumScreen entitlements={entitlements.entitlements} onBack={() => setShowPremium(false)} />;
      }
      if (showSecure) {
        return (
          <SecureProgressScreen
            onComplete={() => { identity.refresh(); setShowSecure(false); }}
            onBack={() => setShowSecure(false)}
          />
        );
      }
      if (showProfile && identity.profile) {
        return (
          <ProfileScreen
            profile={identity.profile}
            onBack={() => setShowProfile(false)}
            onChanged={identity.refresh}
            onSecureProgress={() => setShowSecure(true)}
            onSignOut={() => { setShowProfile(false); identity.signOut(); }}
            onOpenPremium={() => { setShowProfile(false); setShowPremium(true); }}
          />
        );
      }
    }

    // Terminal / retryable errors (no live pack, connection lost, expired…).
    if (phase === 'error' && error) {
      return (
        <StatusView
          title={error.title}
          body={error.body}
          onPrimary={error.retryable ? actions.retry : actions.home}
          primaryLabel={error.retryable ? 'Try again' : 'Back to home'}
          onSecondary={error.retryable && !error.returnHome ? actions.home : undefined}
          secondaryLabel="Back to home"
          busy={busy}
        />
      );
    }

    switch (phase) {
      case 'idle':
      case 'loading_pack':
        return <StatusView title="Brewing today's puzzles…" loading />;

      case 'home_ready':
        return (
          <HomeScreen
            date={status?.date ?? ''}
            puzzleCount={status?.puzzleCount ?? 5}
            onStart={actions.start}
            onStartRanked={cloud ? actions.startRanked : undefined}
            onPractice={cloud ? actions.startPractice : undefined}
            ranked={cloud ? status?.ranked : undefined}
            rankSummary={cloud ? rankSummary : undefined}
            onViewLeaderboards={cloud ? () => setShowLeaderboard(true) : undefined}
            progressSummary={enableProgress ? progressSummary : undefined}
            onViewProgress={cloud ? () => setShowProgress(true) : undefined}
            devTools={devTools}
            username={cloud ? identity.profile?.username : undefined}
            onOpenProfile={cloud && identity.profile ? () => setShowProfile(true) : undefined}
          />
        );

      case 'starting_attempt':
        return <StatusView title="Starting your brew…" loading />;

      case 'opening_puzzle':
      case 'playing':
      case 'submitting':
      case 'revealing':
        // While opening the NEXT slot the previous puzzle+reveal stays on screen
        // (frozen) until the new one is ready — so local mode never flashes a
        // loader between puzzles. Only the very first open (no puzzle yet) waits,
        // and it shares the "Starting…" copy so start → first puzzle reads as one
        // continuous beat (the route key below keeps it from cross-fading).
        if (!puzzle) return <StatusView title="Starting your brew…" loading />;
        return (
          <SessionScreen
            hasAnswerKey={mode === 'local'}
            puzzle={puzzle}
            position={position}
            total={status?.puzzleCount ?? 5}
            outcome={outcome}
            submitting={phase === 'submitting'}
            onAnswer={actions.submit}
            onContinue={actions.proceed}
          />
        );

      case 'completing':
        return <StatusView title="Tallying your BrewScore…" loading />;

      case 'completed':
        if (!score) return <StatusView title="Tallying your BrewScore…" loading />;
        return (
          <ResultsScreen
            score={score}
            onPlayAgain={actions.restart}
            onHome={actions.home}
            busy={busy}
            ranked={ranked}
            rankSummary={cloud && ranked ? rankSummary : undefined}
            onViewLeaderboards={cloud && ranked ? () => setShowLeaderboard(true) : undefined}
            progressSummary={cloud && ranked ? progressSummary : undefined}
            onViewProgress={cloud ? () => setShowProgress(true) : undefined}
            sessionType={ranked ? 'ranked' : mode === 'local' ? 'local' : 'practice'}
            shareDate={status?.date}
            streak={cloud && ranked ? progressSummary.summary?.currentStreak ?? null : null}
            updatedAfterValidation={cloud && ranked ? rankSummary.summary?.updatedAfterValidation : false}
          />
        );

      default:
        return <StatusView title="Brewing today's puzzles…" loading />;
    }
  };

  // Cross-fade between MEANINGFUL screen changes only. The in-session phases
  // (starting → opening → playing → submitting → revealing) share ONE route key
  // so the SessionScreen stays mounted across a submit/reveal/next-slot — those
  // moments are animated intra-screen (the engine and RevealCard fade
  // themselves) and must never trigger a whole-screen cross-fade or remount.
  // The two idle loaders collapse together for the same reason.
  const inSession =
    phase === 'starting_attempt' ||
    phase === 'opening_puzzle' ||
    phase === 'playing' ||
    phase === 'submitting' ||
    phase === 'revealing';
  const routeKey = !launched
    ? 'launch'
    : cloud && identity.phase !== 'ready'
      ? `id-${identity.phase}`
      : cloud && showProgress
        ? 'progress'
        : cloud && showLeaderboard
        ? 'leaderboard'
        : cloud && showPremium
        ? 'premium'
        : cloud && showSecure
          ? 'secure'
          : cloud && showProfile
            ? 'profile'
            : phase === 'error'
            ? 'error'
            : inSession
              ? 'session'
              : phase === 'idle' || phase === 'loading_pack'
                ? 'loading'
                : phase; // home_ready | completing | completed

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <AnimatedMount key={routeKey} distance={0} ms={duration.transition} style={{ flex: 1 }}>
        {body()}
      </AnimatedMount>
    </View>
  );
}
