# Cloud Client Integration (Phase 5A)

Connects the React Native / Expo UI to the deployed server-authoritative gameplay
path ([`SERVER_AUTHORITATIVE_GAMEPLAY.md`](SERVER_AUTHORITATIVE_GAMEPLAY.md)). The
app runs in two modes behind one boundary; the default is **local**, and **all
cloud attempts are unranked**.

```
EXPO_PUBLIC_CONTENT_SOURCE=local   # bundled library, offline, deterministic (default)
EXPO_PUBLIC_CONTENT_SOURCE=cloud   # server-authoritative Edge Functions
```

---

## 1. Mode configuration

One place decides the mode: [`src/cloud/mode.ts`](../src/cloud/mode.ts) (pure,
tested) parses `EXPO_PUBLIC_CONTENT_SOURCE` — unset/`local` → local, `cloud` →
cloud, anything else throws in dev / falls back to local in prod — and
[`src/cloud/env.ts`](../src/cloud/env.ts) reads the real environment (literal
`process.env.EXPO_PUBLIC_*` so Metro inlines it). No screen reads the env or
branches on mode; they all talk to the GameplayService.

## 2. Guest identity

[`src/cloud/guestId.ts`](../src/cloud/guestId.ts) (pure) + [`guestSession.ts`](../src/cloud/guestSession.ts)
(AsyncStorage): an opaque `guest_<32 hex>` id, generated once per install,
persisted, reused across restarts. It is **not authentication** and never
sufficient authorization on its own — the server-issued attempt token is the
real authority. It carries no personal data and is designed to be replaced by an
authenticated Supabase user id later. Storage failures degrade to an in-memory id
for the session rather than blocking play.

## 3. Client/server trust boundary

The client may receive **only**: public pack metadata, public puzzle content,
attempt/open tokens, and — after submission — the verdict, awarded score,
explanation, and final BrewScore. It never receives a correct answer, private
answer payload, seed, validator/reviewer data, service-role credential, or
signing secret. In cloud mode the client never scores and never checks an answer
locally. [`src/cloud/validate.ts`](../src/cloud/validate.ts) enforces this at
runtime with a **recursive forbidden-field guard** on every pre-submit payload;
a leak rejects the whole response in dev and prod.

## 4. State machine

[`src/cloud/sessionMachine.ts`](../src/cloud/sessionMachine.ts) (pure) models the
one-attempt flow and rejects illegal transitions:

```
idle → loading_pack → home_ready → starting_attempt → opening_puzzle
     → playing → submitting → revealing → (repeat 5×) → completing → completed
                                                              ↘ error → retry
```

It enforces: one active attempt, fixed slot order 1→5, no skipping, no duplicate
Start, no duplicate Submit, completion only after five results.
[`useGameplaySession`](../src/data/useGameplaySession.ts) drives it for both
modes, with an in-flight guard so duplicate taps collapse into one request.
Tokens live in memory only; a reload starts a fresh unranked attempt (no insecure
resume).

## 5. Function calls & the service boundary

[`GameplayService`](../src/data/gameplayService.ts) is the interface both screens
and modes use:

| Method | Local | Cloud (Edge Function) |
|--------|-------|------------------------|
| `getTodayStatus` | deterministic pack | `get-daily-pack` |
| `startSession` | reset answers | `start-attempt` |
| `openPuzzle(pos)` | in-memory puzzle | `open-puzzle` (starts server timer) |
| `submitAnswer(pos, answer)` | `scorePuzzle` | `submit-answer` (server scores raw) |
| `completeSession` | `computeBrewScore` | `complete-attempt` |
| `restartSession` | reset | new unranked attempt |

Every cloud call is time-boxed (15s — no infinite spinner) and logged in dev with
tokens/answers redacted ([`diagnostics.ts`](../src/cloud/diagnostics.ts)).

## 6. Answer mapping

[`src/cloud/answerMap.ts`](../src/cloud/answerMap.ts) (pure, tested for all 15
engines) maps the engines' domain `Answer` to the four server submission shapes:
`{selectedId}` (single-choice), `{selectedIds}` (pair/ordering/memory — order
preserved), `{tappedIds}` (Symbol Sweep), `{classifications}` (Rapid
Classification). It rejects malformed answers before the network, caps list sizes,
and never sends a score or a correctness value. To carry the raw interaction,
`SweepAnswer` gained `tappedIds` and `ClassifyAnswer` gained `classifications`
(the local aggregates stay for local scoring).

## 7. Rendering both modes — the answer-key context

The same engines render both modes. In cloud mode the render-safe puzzle has no
answer key, so the cloud service fills absent key fields with safe non-matching
placeholders (no crash, no accidental match) and the inline reveal degrades to
NEUTRAL via [`AnswerKeyProvider`](../src/engines/revealContext.tsx): shared reveal
components (`OptionButton`, `OptionTiles`, `GlyphTile`, `OrderingInput`,
`SequenceChips`-driven engines) show the player's own selection but never mark
correctness — the **RevealCard**, fed by the server result, carries the verdict.
Symbol Sweep is the exception: its targets are public (glyph match), so it opts
back into the rich reveal. Timed engines (Attention Speed, Memory Flash) keep the
Begin gate; the server timer starts at `open-puzzle`, and client time is never
authoritative.

## 8. Error handling

[`src/cloud/errors.ts`](../src/cloud/errors.ts) maps stable server codes to calm
copy with a retry/return-home policy — no raw error, stack, or Supabase wording
reaches the player. Retryable (network, timeout) offer Try Again; terminal
(expired/invalid token, no live pack) return Home. `already_submitted` recovers
without guessing a score (the server's complete-attempt result is authoritative).
Loading/empty/error surfaces use [`StatusView`](../src/components/StatusView.tsx).

## 9. Replay & local fallback

Replay (`restartSession`) starts a brand-new unranked attempt on the same live
pack; the completed attempt is never mutated and expired tokens are never reused.
Local mode is unchanged: fully offline, deterministic date→pack, dev pack switcher
(dev builds only, local only), local scoring/explanations. Local mode never
initializes Supabase.

## 10. Test workflow

| Command | What it proves |
|---------|----------------|
| `npm run test:cloud` | pure cloud logic: mode, guest id, mapping (15 engines), validation (incl. recursive leak + mutation), state machine (duplicate/skip rejected), errors, redaction |
| `npm test` | local scoring/content unchanged |
| `npm run cloud:live-check` | the app's real validators/mappers against the DEPLOYED functions: no wire leak, explanation only post-submit, score matches, unranked |
| `npx tsc --noEmit` | types across both modes |
| `npx expo export --platform web` | the bundle builds (incl. AsyncStorage + cloud) |

## 11. Real-device checklist (Founder)

Run Expo Go over LAN (or `--tunnel` fallback). Set `EXPO_PUBLIC_CONTENT_SOURCE`
per mode in `.env`. Verify: persistent guest id survives restart; all Unicode
glyphs render; Memory Flash timing feels fair; Attention Speed thumb interaction;
network-interruption + background/resume behave; result animations; and — in a
network inspector — no token/answer/secret in traffic and no answer before submit.

## 12. Deferred (not in this phase)

Accounts/auth, ranked play, profiles, daily leaderboards, personal progress
(streaks / history / statistics), privacy-safe Share Cards, and unranked Practice
have since shipped (see
[`PLAYER_IDENTITY_AND_PROFILES.md`](PLAYER_IDENTITY_AND_PROFILES.md),
[`RANKED_DAILY_ATTEMPTS.md`](RANKED_DAILY_ATTEMPTS.md),
[`DAILY_LEADERBOARDS.md`](DAILY_LEADERBOARDS.md),
[`PLAYER_PROGRESS_AND_STREAKS.md`](PLAYER_PROGRESS_AND_STREAKS.md),
[`SHARE_CARDS_AND_PRACTICE.md`](SHARE_CARDS_AND_PRACTICE.md)). Still deferred:
friends / private groups, weekly/monthly/all-time boards, achievements, premium
subscriptions / archives / category training, and Apple Sign-In. Practice is
unlimited during beta and always unranked; extra ranked attempts are never sold.

> **Phase 7D — entitlements.** A single server-authoritative read,
> `get_my_entitlements`, now answers "what can this player do?" via a validated,
> fail-closed capability set. The client layer (`entitlementService` /
> `useEntitlements` / `validateEntitlements`) feeds the Premium-preview surfaces
> only and never gates the play path; the session cache resets on any identity
> change. **No purchasing, prices, or providers exist.** See
> [`ENTITLEMENT_FOUNDATION.md`](ENTITLEMENT_FOUNDATION.md).

> **Phase 7E — RevenueCat.** The client gains a platform-safe purchase layer
> (`src/cloud/revenuecat/*`): `RevenueCatService` (behind a mockable adapter),
> offering mapping, `usePremium` (purchase/restore + a bounded "finalizing"
> server-sync poll), and a sandbox-capable Premium screen. Native only — web /
> Expo Go show a calm unsupported state and the web bundle stays clean (the SDK is
> dynamically imported, never executed on web). The SDK is never the sole authority
> for a protected feature; the server's `get_my_entitlements` is. See
> [`REVENUECAT_INTEGRATION.md`](REVENUECAT_INTEGRATION.md).
