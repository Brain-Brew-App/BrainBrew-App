/**
 * Email normalization, validation, and masking — pure, platform-free, tested.
 *
 * Practical client-side checks only; Supabase Auth is the source of truth for
 * identity and does the real verification. We never store the email in the
 * BrainBrew profile, and we never reveal a full address in the UI or logs.
 */

const EMAIL_RE = /^[^\s@"']{1,64}@[^\s@.]{1,63}(\.[^\s@.]{1,63})+$/;
const MAX_EMAIL = 254;

/** True if the string has any control (<0x20/0x7f) or invisible/zero-width char. */
function hasControlOrInvisible(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x20 || c === 0x7f) return true; // control
    if (c === 0x200b || c === 0x200c || c === 0x200d || c === 0xfeff) return true; // zero-width / BOM
    if (c >= 0x202a && c <= 0x202e) return true; // bidi overrides
  }
  return false;
}

/** Trim; lowercase the DOMAIN only (local-part case is preserved). */
export function normalizeEmail(raw: string): string {
  const trimmed = (raw ?? '').trim();
  const at = trimmed.lastIndexOf('@');
  if (at < 0) return trimmed;
  return trimmed.slice(0, at) + '@' + trimmed.slice(at + 1).toLowerCase();
}

export function validateEmail(raw: string): { ok: true; email: string } | { ok: false; error: string } {
  const email = normalizeEmail(raw);
  if (email.length === 0) return { ok: false, error: 'email_required' };
  if (email.length > MAX_EMAIL) return { ok: false, error: 'email_too_long' };
  if (hasControlOrInvisible(email) || /\s/.test(email)) return { ok: false, error: 'email_invalid' };
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'email_invalid' };
  return { ok: true, email };
}

/** `alice@gmail.com` -> `a•••@g•••.com`. Never reveals the full address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const tld = dot >= 0 ? domain.slice(dot) : '';
  const dName = dot >= 0 ? domain.slice(0, dot) : domain;
  return `${local[0]}•••@${dName[0] ?? '•'}•••${tld}`;
}
