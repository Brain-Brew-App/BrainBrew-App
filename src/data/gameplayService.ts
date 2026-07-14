/**
 * GameplayService — the single boundary the screens talk to, in BOTH modes.
 *
 * The Home, Session, and Results screens call this interface and never branch on
 * `EXPO_PUBLIC_CONTENT_SOURCE` themselves. `getGameplayService()` returns the
 * local implementation (bundled library, local scoring) or the cloud one
 * (server-authoritative Edge Functions) per the resolved content mode.
 *
 * The interface is shaped around the SECURE cloud flow — open one slot at a time,
 * submit a raw answer, receive a server-scored result — and the local
 * implementation satisfies the same contract with in-memory data. So the exact
 * same screens and engines render both.
 */

import type { Answer, BrewScore, CategoryResult, Puzzle } from '../types/puzzle';

export type ServiceMode = 'local' | 'cloud';

/**
 * The player's ranked standing for today's UTC date, derived entirely by the
 * server (get_today_player_status). The client never computes eligibility or
 * ranked-ness — it renders what the server reports. Deliberately carries NO
 * rank, percentile, or competitor data (Phase 6A is not leaderboards).
 */
export interface RankedTodayStatus {
  /**
   * TRUE when the ranked check itself FAILED (network/timeout/server) — we do not
   * know whether this player may play ranked today.
   *
   * This exists because the failure used to be swallowed: the status came back
   * `undefined`, Home read that as "no ranked available", and offered a plain
   * "Start Today's Brew" button that quietly started an UNRANKED attempt. The player
   * believed they were playing their one daily ranked brew and was never told
   * otherwise. Unknown must be rendered as unknown — never as "not eligible", and
   * never silently downgraded.
   */
  unknown?: boolean;
  /** Whether a NEW ranked attempt can be started right now. */
  eligible: boolean;
  /** Stable server reason code (e.g. 'eligible', 'anonymous_account', 'ranked_attempt_completed'). */
  reason: string;
  /** Lifecycle of today's ranked attempt for this user. */
  state: 'none' | 'active' | 'completed' | 'expired';
  /** The locked BrewScore once today's ranked attempt is completed. */
  lockedScore: number | null;
  /** Whether unranked practice is offered (always true in this phase). */
  practiceAvailable: boolean;
  /** A short, player-safe message for the current state. */
  message: string;
}

export interface TodayStatus {
  /** UTC ISO date, e.g. "2026-07-11". */
  date: string;
  /** False when no live pack exists for today (cloud) — Home shows the empty state. */
  available: boolean;
  puzzleCount: number;
  difficultyLabel?: string;
  /** Cloud only: the player's ranked standing for today. Omitted in local mode. */
  ranked?: RankedTodayStatus;
  /** Local only, for the dev pack switcher. Omitted in cloud. */
  packId?: string;
  packIndex?: number;
}

/** A render-safe puzzle ready for the engine router. In cloud mode its answer fields are absent. */
export interface OpenedPuzzle {
  position: number;
  puzzle: Puzzle;
}

/** The reveal payload for one slot: the server-authoritative (or local) result + explanation. */
export interface SlotOutcome {
  result: CategoryResult;
  explanation: string;
}

export interface FinalOutcome {
  score: BrewScore;
  /** True when this was the player's ranked attempt for the day (cloud only). */
  ranked: boolean;
  /** The UTC date this ranked result is bound to, when ranked. */
  rankedDate?: string | null;
}

/** How a session should be started. Local mode ignores `ranked` (always practice). */
export interface StartOptions {
  /** Request the ONE ranked attempt for today. The server verifies eligibility;
   *  a request is not authority. Ignored in local mode. */
  ranked?: boolean;
}

/** The result of starting (or resuming) a session. */
export interface StartResult {
  puzzleCount: number;
  /** Whether the started/resumed attempt is ranked. */
  ranked: boolean;
  /** For a resumed ranked attempt: the slot to open first (1..5). Fresh = 1. */
  resumePosition?: number;
  /** Slots already scored on a resumed attempt (so the UI can skip them). */
  completedPositions?: number[];
  /** Set when the ranked attempt for today is already complete — no new attempt
   *  was started; the caller should show the locked result, not gameplay. */
  alreadyCompleted?: { lockedScore: number } | null;
}

/**
 * A gameplay session. One active attempt at a time; slots are opened in fixed
 * order 1..5. Implementations must reject out-of-order use, but the session
 * state machine (cloud) and the screen flow already enforce order.
 */
export interface GameplayService {
  readonly mode: ServiceMode;
  /** Whether this service can ever produce a ranked result (cloud only). */
  readonly supportsRanked: boolean;
  /** Whether the CURRENT in-progress attempt is ranked. */
  readonly ranked: boolean;

  getTodayStatus(): Promise<TodayStatus>;
  /** Begin (or securely resume) an attempt on today's pack. */
  startSession(opts?: StartOptions): Promise<StartResult>;
  /** Begin (or resume) a fresh UNRANKED Practice brew. Cloud = reserve content;
   *  local = the offline local pack. Always unranked. */
  startPractice(): Promise<StartResult>;
  /** Premium Archives: begin (or resume) an UNRANKED replay of a PAST daily pack.
   *  Entitlement is re-checked SERVER-SIDE; cloud only. */
  startArchive(date: string): Promise<StartResult>;
  /** Open the slot at `position` (1..5); starts the (server) timer. */
  openPuzzle(position: number): Promise<OpenedPuzzle>;
  /** Submit the player's raw answer for `position`; returns the scored reveal. */
  submitAnswer(position: number, answer: Answer): Promise<SlotOutcome>;
  /** Finalize the BrewScore after all five slots. */
  completeSession(): Promise<FinalOutcome>;
  /** Start a brand-new UNRANKED practice attempt on the same pack (Replay). */
  restartSession(): Promise<StartResult>;
}
