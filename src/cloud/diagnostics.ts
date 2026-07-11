/**
 * Development-only network diagnostics for the cloud flow.
 *
 * Logs enough to debug a call — function name, HTTP status, duration, slot,
 * engine, stable error code — and NOTHING sensitive: never a token, a full
 * session id, a player answer, a correct answer, a secret, or a raw private
 * response. Silent in production.
 *
 * The redaction helpers are pure and unit-tested; the logger is a thin dev-only
 * console wrapper.
 */

declare const __DEV__: boolean | undefined;
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__ === true;

/** Truncate an opaque id to a short, non-identifying tag (e.g. tokens, session ids). */
export function redactId(value: string | undefined | null): string {
  if (!value) return '∅';
  if (value.length <= 6) return '••';
  return `${value.slice(0, 4)}…(${value.length})`;
}

export interface CallDiagnostic {
  fn: string;
  status: number;
  ms: number;
  position?: number;
  engineId?: string;
  errorCode?: string;
}

/** A one-line, redacted summary of a function call. Pure — returns the string. */
export function formatCall(d: CallDiagnostic): string {
  const parts = [
    `[cloud] ${d.fn}`,
    `${d.status}`,
    `${Math.round(d.ms)}ms`,
    d.position != null ? `slot=${d.position}` : '',
    d.engineId ? `engine=${d.engineId}` : '',
    d.errorCode ? `error=${d.errorCode}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

/** Log a call summary in development only. Never logs tokens/answers/secrets. */
export function logCall(d: CallDiagnostic): void {
  if (!IS_DEV) return;
  // eslint-disable-next-line no-console
  console.log(formatCall(d));
}

/**
 * The four share operational events (Phase 7A). Dev-only console; NO analytics
 * platform, NO image, NO share target or social account is ever stored or sent.
 * This is the deliberately minimal, in-memory-only event boundary.
 */
export type ShareEvent = 'share_requested' | 'share_completed' | 'share_cancelled' | 'share_failed';
export function logShareEvent(event: ShareEvent): void {
  if (!IS_DEV) return;
  // eslint-disable-next-line no-console
  console.log(`[share] ${event}`);
}
