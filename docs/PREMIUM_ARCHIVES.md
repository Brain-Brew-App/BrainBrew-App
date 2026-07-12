# Premium Archives (Phase 7J)

Premium subscribers can replay **past** daily packs as **unranked** "Archive Brews".
Archives never touch ranked fairness or history.

## What Archives are
- Browse past BrainBrew daily packs (UTC dates strictly before today).
- Open a historical date and replay its five-puzzle pack.
- The session is **always Practice / Unranked**.
- Results **never** alter the historical ranked result, that date's leaderboard,
  streaks, ranked statistics, or today's locked ranked score, and never count as an
  extra ranked attempt.
- Historical content + answers stay server-authoritative; a voided historical slot is
  excluded from play + scoring (corrected active-slot policy).

Archives are **not** editing history or competing retroactively.

## Data model (server-authoritative)
- `attempt_purpose` enum gains **`archive`** (own migration so the value commits
  before use). `attempts.archive_date_snapshot date` binds the historical date;
  `archive_never_ranked` constraint forbids `is_ranked=true` with a snapshot.
- `set_attempt_purpose()` derives `archive` for an unranked attempt that carries a
  snapshot — the client can never claim a purpose.
- An archive attempt is a normal server-authoritative attempt: `is_ranked=false`,
  `pack_id` = the historical `daily_packs` row, `attempt_items` created per non-void
  slot, server-issued tokens + scoring reused. It is therefore excluded from every
  ranked surface exactly as practice is (they all filter `is_ranked=true`).

## Entitlement (enforced server-side — never a client flag)
- `get_my_entitlements().capabilities.archives = is_premium` — true only for
  `premium` / `grace_period` / `billing_issue` (via `entitlement_has_premium`).
  Beta/free/expired/revoked → **false** (the paid feature stays gated so it can be
  certified; beta_open does not unlock it by default).
- `player_can_archive(uid)` is the canonical gate used by all archive RPCs.

## RPCs
- `get_archive_calendar(limit, offset)` → past published packs + per-caller `locked`
  state. No answers. Paginated (≤90).
- `get_archive_pack(date)` → entitlement-gated; past + published only; sanitized
  five-slot content (`public_payload`, no answers); void slots flagged.
- `start_archive_attempt(user, date, session, app_version)` → **service-role**
  (an Edge Function calls it after verifying the JWT); entitlement-gated; past
  published pack; creates the unranked archive attempt + items; **resumes** an
  active archive attempt for the same user+date.

## Ranked fairness invariant (unchanged)
`ranked_attempts_per_utc_day` stays a **hard constant 1** in every state and policy.
No Premium state, product, policy, or Archive attempt changes it. Proven by
`db:archives-test` (mutation tests: an archive attempt cannot be ranked; a client
cannot grant itself premium, flip policy, or start an archive; free is denied; a
ranked attempt coexists with an archive attempt on the same pack without counting
twice) + `db:revenuecat-test` (ranked-1 in every state) + `db:entitlement-test`.

## Mid-session entitlement change (policy)
- Premium **expires** during an active Archive attempt → allow that attempt to
  complete; block starting another afterward; never destroy in-puzzle progress.
- **Revoked** (fraud/refund) → no new starts; active-session completion follows the
  documented security policy.
- Caches (entitlement + archive access) invalidate on purchase / restore / webhook /
  reconciliation / account switch / sign-out / expiration-revocation / policy change.

## Tests
`npm run db:archives-test` — **27 checks**: server entitlement gate, sanitized
calendar/pack reads (no answers, past-only), unranked isolation, resume, fairness
invariant, and the Part-N/R mutation tests. No regressions in entitlement/revenuecat/
practice/ranked/progress suites.

## Client correctness core (7J.4 — pure, tested)
Built + tested (`npm run test:premium-archive`, 36 checks), device-independent:
- **Premium state machine** (`src/cloud/revenuecat/premiumMachine.ts`) — explicit
  states (idle/loading_entitlement/loading_offering/ready_free/ready_premium/
  purchasing/cancelled/finalizing/restoring/nothing_to_restore/sync_delayed/
  conflict/store_unavailable/unsupported_platform/network_error/error). Invariants:
  an SDK "purchased" result goes to **finalizing**, NOT premium — only a server
  `SYNC_CONFIRMED` flips to `ready_premium` (`premiumUnlocked()` is the only Archives
  gate); **cancellation is neutral**; **single-flight** (duplicate taps collapse);
  **account switch / sign-out hard-reset** so User B never inherits User A.
- **Bounded server-sync-wait** (`serverSync.ts`) — backoff schedule + `decideSync`
  (confirmed/continue/timeout); a delayed webhook surfaces `sync_delayed` with Retry
  Sync / Restore, never "purchase failed"; safe diagnostic ref (no provider id).
- **Archive client validation** (`src/cloud/archive/archiveValidate.ts`) — validates
  calendar (past-only), pack (fixed category order, void-aware denominator), and the
  start response (unranked, no client score), plus a **recursive forbidden-field
  guard** (`assertNoForbiddenFields`: correct_answer/seed/receipt/purchase_token/
  provider_customer_id/answer keys/etc.) so an answer or provider secret can never
  render even if the server regressed.

## Build runbook (Android development build — after RC/Play config)
```
eas login && eas whoami
# RC public Android key + Supabase public vars via EAS env (never committed):
eas env:create --environment development --name EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY --value <key>
eas build --profile development --platform android      # → install AAB/APK on the S21+
npm run start                                            # dev-client Metro
```
The public SDK key never enters committed source; local mode never initializes
RevenueCat; RevenueCat configures only after the verified Auth UUID exists.

## Not yet built (Founder-device-gated or later checkpoint)
The Archives **app UI** (calendar/locked/session/results screens), the client
purchase/restore/server-sync hardening states, and Test-Store / Google-Play sandbox
certification are the remaining 7J work — the backend they drive is live + tested.
See STORE_SANDBOX_TESTING.md for the Founder configuration checklist.
