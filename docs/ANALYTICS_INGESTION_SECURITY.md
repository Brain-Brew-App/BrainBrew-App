# Analytics Ingestion Security (Phase 7G)

The trust model for the client-event pipeline. The guiding rule: **the client can
describe its own UI behaviour, and nothing more** — it cannot spoof a user, write
arbitrary rows, or smuggle sensitive data.

---

## 1. The only writer

`analytics_events` has RLS enabled with **no policies** and no client grants — the
Data API cannot read or write it. The sole writer is the service-role
`ingest_analytics_events` RPC, called by the `analytics-ingest` Edge Function.

## 2. Edge Function ([`analytics-ingest`](../supabase/functions/analytics-ingest/index.ts))

- **User derived from the verified JWT** (`requireUser`) — never from the body. A
  spoofed `user_id` in an event is ignored (proven in `db:analytics-test`: the row
  belongs to the caller-derived user).
- Body ≤ 32 KB; batch ≤ 50 events.
- Auth failure → 401. **Every other failure → a safe 200-ish response** so a
  client's analytics problem can NEVER block the app loop.
- Logs counts only — never event payloads.

## 3. Server validation (`ingest_analytics_events`)

- **Event-name allowlist** (`analytics_event_allowed`) — unknown names rejected.
- **Property guard** (`analytics_props_safe`) — rejects any event whose properties
  contain `email/password/token/receipt/customer_id/correct_answer/seed/ip/
  latitude/longitude/ad_id/...`, and caps property size (≤ 4 KB).
- **Platform** must be ios/android/web/unknown.
- **Dedup** on `dedup_key` (unique index) — a re-delivered batch is idempotent.
- Batch cap enforced again server-side.

## 4. What is never collected

No full IP (indefinitely), contacts, GPS coordinates, advertising IDs, puzzle
answers, emails, provider/customer identifiers, payment data, or raw Auth tokens.
The client scrubs these before sending AND the server rejects them — defence in
depth. See [`ADMIN_DATA_PRIVACY.md`](ADMIN_DATA_PRIVACY.md) for retention.

## 5. Rate & abuse posture

Batch + size caps bound a single request. Supabase's platform rate limiting
fronts the function. Because ingestion is best-effort and non-authoritative,
dropping abusive traffic has zero gameplay impact. (A per-user token-bucket can be
added to the RPC if abuse is observed.)

## 6. Tested (`npm run db:analytics-test`)

Valid accepted · unknown rejected · forbidden-field (answer/email) rejected · bad
platform rejected · duplicate ignored · batch > 50 rejected · spoofed user ignored ·
clients denied on the table and all RPCs. Mutation cases (trust client user id,
accept arbitrary/answer props, process duplicate twice) fail by construction.
