/**
 * Stable server/validation error codes → calm, player-facing copy.
 *
 * The Edge Functions return machine codes (docs/SERVER_AUTHORITATIVE_GAMEPLAY.md
 * §6); this is the ONE place they become UI text. No raw error object, stack, or
 * Supabase wording ever reaches the player. Each entry says whether the step is
 * safe to retry or the player should return Home.
 *
 * Pure and platform-free — unit-tested.
 */

export interface ErrorCopy {
  title: string;
  body: string;
  /** Retry re-issues the same safe operation. */
  retryable: boolean;
  /** When true, the only safe action is returning Home (the attempt is dead). */
  returnHome: boolean;
}

const GENERIC: ErrorCopy = {
  title: 'Something went wrong',
  body: 'We hit a snag reaching the kitchen. Please try again.',
  retryable: true,
  returnHome: false,
};

/** Match the most specific code first (codes may be like `invalid_token:expired`). */
const TABLE: Record<string, ErrorCopy> = {
  no_live_pack: {
    title: "No brew today",
    body: "Today's brew isn't ready yet. Please check back shortly.",
    retryable: true,
    returnHome: true,
  },
  network_error: {
    title: 'Connection lost',
    body: 'We couldn’t reach the server. Check your connection and try again.',
    retryable: true,
    returnHome: false,
  },
  timeout: {
    title: 'Taking too long',
    body: 'The server is slow to respond. Try again in a moment.',
    retryable: true,
    returnHome: false,
  },
  bad_session: {
    title: 'Session problem',
    body: 'We couldn’t set up your guest session. Please try again.',
    retryable: true,
    returnHome: false,
  },
  'invalid_token:expired': {
    title: 'Session expired',
    body: 'This brew has been idle too long. Start a fresh one.',
    retryable: false,
    returnHome: true,
  },
  invalid_token: {
    title: 'Session invalid',
    body: 'We couldn’t verify this brew. Start a fresh one.',
    retryable: false,
    returnHome: true,
  },
  already_submitted: {
    title: 'Already answered',
    body: 'That puzzle was already submitted. Moving on.',
    retryable: false,
    returnHome: false,
  },
  attempt_not_active: {
    title: 'Brew finished',
    body: 'This brew is already complete. Start a fresh one.',
    retryable: false,
    returnHome: true,
  },
  slot_voided: {
    title: 'Puzzle unavailable',
    body: 'This puzzle was withdrawn. Start a fresh brew.',
    retryable: false,
    returnHome: true,
  },
  answer_leak: {
    title: 'Unavailable',
    body: 'We received an unexpected response and stopped to keep things fair.',
    retryable: false,
    returnHome: true,
  },
  invalid_submission: {
    title: 'Couldn’t read that answer',
    body: 'Something about that answer didn’t come through. Please try again.',
    retryable: true,
    returnHome: false,
  },
  ranked_ineligible: {
    title: 'Ranked isn’t available',
    body: 'Today’s ranked brew isn’t available for you right now. You can still play for practice.',
    retryable: false,
    returnHome: true,
  },
  practice_pool_exhausted: {
    title: 'No fresh practice right now',
    body: 'We couldn’t assemble a fresh Practice Brew at the moment. Please try again later.',
    retryable: false,
    returnHome: true,
  },
};

/** Resolve copy for a stable error code, matching `prefix:detail` codes too. */
export function errorCopy(code: string): ErrorCopy {
  if (TABLE[code]) return TABLE[code];
  const prefix = code.split(':')[0];
  if (TABLE[prefix]) return TABLE[prefix];
  // invalid_submission:expected_selectedId etc.
  for (const key of Object.keys(TABLE)) {
    if (code.startsWith(key)) return TABLE[key];
  }
  return GENERIC;
}

export class CloudFlowError extends Error {
  readonly copy: ErrorCopy;
  constructor(public readonly code: string) {
    super(code);
    this.name = 'CloudFlowError';
    this.copy = errorCopy(code);
  }
}
