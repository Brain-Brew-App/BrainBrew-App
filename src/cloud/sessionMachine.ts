/**
 * Cloud session state machine — pure, effect-free, exhaustively testable.
 *
 * It models the one-attempt-at-a-time flow: load the pack, start an attempt,
 * then for each of five fixed slots open → play → submit → reveal → continue,
 * finally complete. It enforces the rules the UI must not violate — no duplicate
 * start, no duplicate submit, no skipping a slot, completion only after five
 * results — by rejecting illegal transitions rather than trusting the caller.
 *
 * The service in `cloudGameplayService.ts` owns the network effects; it advances
 * this machine and reads the resulting phase to decide what to do next. Keeping
 * effects out is what makes every transition unit-testable.
 */

import type { Category, EngineId } from '../types/puzzle';

export type SessionPhase =
  | 'idle'
  | 'loading_pack'
  | 'home_ready'
  | 'starting_attempt'
  | 'opening_puzzle'
  | 'playing'
  | 'submitting'
  | 'revealing'
  | 'completing'
  | 'completed'
  | 'error';

/** One server-scored slot, as revealed after submission. */
export interface SlotResult {
  position: number;
  engineId: EngineId;
  category: Category;
  verdict: 'correct' | 'partial' | 'incorrect';
  correct: boolean;
  points: number;
  accuracyPoints: number;
  speedPoints: number;
  explanation: string;
  elapsedMs: number;
}

export interface SessionError {
  code: string;
  /** Whether the failed step can be retried, or the player must return Home. */
  retryable: boolean;
  /** The phase to return to on RETRY. */
  retryTo: SessionPhase;
}

export interface SessionState {
  phase: SessionPhase;
  /** Current slot, 1..5. 0 before the first slot opens. */
  position: number;
  results: SlotResult[];
  finalScore: number | null;
  error: SessionError | null;
}

export const TOTAL_SLOTS = 5;

export const initialSession: SessionState = {
  phase: 'idle',
  position: 0,
  results: [],
  finalScore: null,
  error: null,
};

export type SessionEvent =
  | { type: 'LOAD_PACK' }
  | { type: 'PACK_LOADED' }
  | { type: 'PACK_FAILED'; code: string; retryable?: boolean }
  | { type: 'START' }
  | { type: 'ATTEMPT_STARTED' }
  | { type: 'RESUME'; position: number; completed: SlotResult[] }
  | { type: 'START_FAILED'; code: string; retryable?: boolean }
  | { type: 'OPEN' }
  | { type: 'PUZZLE_OPENED' }
  | { type: 'OPEN_FAILED'; code: string; retryable?: boolean }
  | { type: 'SUBMIT' }
  | { type: 'SUBMITTED'; result: SlotResult }
  | { type: 'SUBMIT_FAILED'; code: string; retryable?: boolean }
  | { type: 'CONTINUE' }
  | { type: 'COMPLETED'; finalScore: number }
  | { type: 'COMPLETE_FAILED'; code: string; retryable?: boolean }
  | { type: 'RETRY' }
  | { type: 'RESET' };

export class InvalidTransition extends Error {
  constructor(phase: SessionPhase, event: string) {
    super(`illegal transition: ${event} in phase ${phase}`);
    this.name = 'InvalidTransition';
  }
}

const fail = (state: SessionState, code: string, retryable: boolean, retryTo: SessionPhase): SessionState => ({
  ...state,
  phase: 'error',
  error: { code, retryable, retryTo },
});

/**
 * The single transition function. Throws `InvalidTransition` for an illegal
 * (phase, event) pair — that is how duplicate Start/Submit and slot-skipping are
 * rejected. `RESET` is always legal (it starts a fresh attempt).
 */
export function transition(state: SessionState, event: SessionEvent): SessionState {
  if (event.type === 'RESET') return { ...initialSession };

  const { phase } = state;

  switch (event.type) {
    case 'LOAD_PACK':
      if (phase !== 'idle' && phase !== 'error') throw new InvalidTransition(phase, event.type);
      return { ...initialSession, phase: 'loading_pack' };

    case 'PACK_LOADED':
      if (phase !== 'loading_pack') throw new InvalidTransition(phase, event.type);
      return { ...state, phase: 'home_ready', error: null };

    case 'PACK_FAILED':
      if (phase !== 'loading_pack') throw new InvalidTransition(phase, event.type);
      return fail(state, event.code, event.retryable ?? true, 'loading_pack');

    case 'START':
      // Only from home_ready — a second Start tap in any other phase is rejected.
      if (phase !== 'home_ready') throw new InvalidTransition(phase, event.type);
      return { ...state, phase: 'starting_attempt', results: [], finalScore: null, position: 0, error: null };

    case 'ATTEMPT_STARTED':
      if (phase !== 'starting_attempt') throw new InvalidTransition(phase, event.type);
      return { ...state, phase: 'opening_puzzle', position: 1 };

    case 'RESUME': {
      // Securely resume a ranked attempt: the SERVER already scored the earlier
      // slots (`completed`), so we seed them and open the next unfinished slot.
      // The one-attempt invariant (five results at completion) is preserved; the
      // authoritative per-slot results still come from complete-attempt.
      if (phase !== 'starting_attempt') throw new InvalidTransition(phase, event.type);
      if (event.position < 1 || event.position > TOTAL_SLOTS) throw new InvalidTransition(phase, 'RESUME(bad position)');
      if (event.completed.length >= TOTAL_SLOTS) throw new InvalidTransition(phase, 'RESUME(nothing to resume)');
      return { ...state, phase: 'opening_puzzle', position: event.position, results: [...event.completed] };
    }

    case 'START_FAILED':
      if (phase !== 'starting_attempt') throw new InvalidTransition(phase, event.type);
      return fail(state, event.code, event.retryable ?? true, 'starting_attempt');

    case 'OPEN':
      // Re-open only when opening (idempotent retry) — never mid-play.
      if (phase !== 'opening_puzzle') throw new InvalidTransition(phase, event.type);
      return state;

    case 'PUZZLE_OPENED':
      if (phase !== 'opening_puzzle') throw new InvalidTransition(phase, event.type);
      return { ...state, phase: 'playing' };

    case 'OPEN_FAILED':
      if (phase !== 'opening_puzzle') throw new InvalidTransition(phase, event.type);
      return fail(state, event.code, event.retryable ?? true, 'opening_puzzle');

    case 'SUBMIT':
      // Only from playing — a duplicate submit (already submitting/revealing) is rejected.
      if (phase !== 'playing') throw new InvalidTransition(phase, event.type);
      return { ...state, phase: 'submitting' };

    case 'SUBMITTED': {
      if (phase !== 'submitting') throw new InvalidTransition(phase, event.type);
      if (event.result.position !== state.position) throw new InvalidTransition(phase, 'SUBMITTED(wrong slot)');
      return { ...state, phase: 'revealing', results: [...state.results, event.result] };
    }

    case 'SUBMIT_FAILED':
      if (phase !== 'submitting') throw new InvalidTransition(phase, event.type);
      return fail(state, event.code, event.retryable ?? true, 'playing');

    case 'CONTINUE': {
      // Only from revealing — cannot skip an unrevealed slot.
      if (phase !== 'revealing') throw new InvalidTransition(phase, event.type);
      if (state.position < TOTAL_SLOTS) {
        return { ...state, phase: 'opening_puzzle', position: state.position + 1 };
      }
      return { ...state, phase: 'completing' };
    }

    case 'COMPLETED':
      if (phase !== 'completing') throw new InvalidTransition(phase, event.type);
      if (state.results.length !== TOTAL_SLOTS) throw new InvalidTransition(phase, 'COMPLETED(before five results)');
      return { ...state, phase: 'completed', finalScore: event.finalScore };

    case 'COMPLETE_FAILED':
      if (phase !== 'completing') throw new InvalidTransition(phase, event.type);
      return fail(state, event.code, event.retryable ?? true, 'completing');

    case 'RETRY':
      if (phase !== 'error' || !state.error) throw new InvalidTransition(phase, event.type);
      if (!state.error.retryable) throw new InvalidTransition(phase, 'RETRY(non-retryable)');
      return { ...state, phase: state.error.retryTo, error: null };

    default: {
      const _exhaustive: never = event;
      throw new InvalidTransition(phase, (_exhaustive as { type: string }).type);
    }
  }
}

/** True once all five slots are scored — completion is allowed only here. */
export const canComplete = (state: SessionState): boolean => state.results.length === TOTAL_SLOTS;
