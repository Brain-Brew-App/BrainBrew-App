# Admin Founder Feedback Log (Phase 7H)

Issues from the Founder's live testing, their root cause, fix, and verification.
An item is only closed after it is verified live.

| # | Page | Problem | Severity | Root cause | Fix | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | All | Dashboard very slow to load | High | ~21 auth/RBAC network round-trips per navigation (uncached context + 15 `admin_can` RPCs) | Request-cached context (React `cache()`) + in-process RBAC matrix + parallel layout queries → 2 calls | Call count reduced 21→2; build green; RPCs live-OK |
| 2 | All | "Dummy data?" — numbers looked wrong | Med | Data is real but from test/dev accounts + genuine emptiness (no live pack, no events) | Confirmed real; added honest empty/pending states; documented test-user exclusion | Verified via live counts (27 test users, real) |
| 3 | Shell/nav | Flat wall of equally-weighted links | Med | Ungrouped nav, no active state | Grouped nav (Analytics/Content/Business/People/Operations) + active-page state + role/env indicators + high-risk (Maintenance) visually separated | Build green; renders grouped |
| 4 | Content pages | Puzzles/Packs/Content were stubs | Med | Not yet built | Real paginated read pages backed by new RPCs | Build green; RPCs live-OK |
| 5 | KPI cards | "0" shown when data unavailable; MRR ambiguous | Med | No distinction between zero and unavailable | `pending`/`unavailable`/`empty` states; MRR labeled pending with source note | Build green |
| 6 | Login | Invalid credentials on the live URL | High | Deployed `SUPABASE_ANON_KEY` was corrupted (env-set regex dropped the `sb_` leading char) | Re-set env from correct source; redeployed | Founder signed in successfully |
| 7 | Login | Form flashed then vanished | High | Strict CSP blocked Next's inline scripts (no nonce; static page) | Per-request nonce CSP in middleware + dynamic rendering | Login renders + hydrates; verified live |

## Notes
- Items 6 and 7 were live deployment bugs found during bring-up (fixed in the same
  session). Items 1, 3, 4, 5 are the 7H build-out. Item 2 was a clarification (real,
  not fake — the dashboard faithfully reports a mostly-test dataset).
