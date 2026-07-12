# Admin User Support (Phase 7H)

A safe user-lookup page (`/support`) for Founder + Support (`lookup_user`).

## Search
- Exact **username** (case-insensitive via `username_normalized`) or Auth **UUID**;
  minimum 3 chars; capped result (25). RPC `admin_user_lookup` — no enumeration.
- Email lookup would go through the server-only Supabase Admin API (exact match
  only); not enabled by default to avoid enumeration.

## Profile (RPC `admin_user_profile`)
Shows only safe operational fields: username, account type, country, created,
last activity, onboarding, ranked summary (completed/best/last), practice summary,
entitlement **safe state** (state + is_active), and the analytics test-flag.

## Never shown
Passwords, Auth/provider tokens, RevenueCat customer internals, raw payment data,
submitted answers, anti-cheat thresholds, service credentials.

## Actions (minimal, certified-safe only)
- **Mark / unmark analytics test subject** — `set_subject_flag`, server-authorized,
  reason-captured, **audited**. Excludes/includes the user in business KPIs.
- Deferred (require separate certification): impersonation, password reset, account
  deletion, result invalidation, ranked restriction, entitlement grants, disable.
Every action is server-authorized, revalidated against current state, and audited.
