# Admin Content Security (Phase 7H.2)

Security invariants for content operations.

- **Canonical validator cannot be bypassed.** Approval (`admin_decide_draft_review`)
  and promotion (`admin_promote_draft_to_reserve`) require a passing validation; the
  DB approval trigger independently requires a passing `puzzle_validation_results` +
  an answer. Content Admin has no override; no exceptional-override path is
  implemented.
- **Answer keys** are private (`puzzle_answers`, `authoring_drafts.answer_payload`),
  returned only to Founder/Content Admin, and every reveal is audited.
- **Two-person control** on approval (author ≠ reviewer; Founder emergency override is
  explicit + audited). No fabricated second approver in tests.
- **Immutability:** live/historical puzzle rows/answers/hashes are never mutated;
  used/approved/scheduled content is never hard-deleted (7H.1 guards).
- **RBAC + reauth:** all content RPCs are service-role only; the Admin server checks
  capability in-process (request-memoized) before calling them; destructive actions
  (delete draft, void) require password reauthentication + typed confirmation.
- **Audit:** every material operation (save/submit/decide/promote/retire/delete/
  answer-view) writes an append-only `admin_audit_log` row, in the same transaction
  where practical. Summaries are scrubbed of secrets/answers.
- **Concurrency:** state transitions use `for update` row locks; a rebuild invalidates
  a pending review; promotion checks id uniqueness transactionally.
- **No browser secrets:** the service role + any provider key are server-only.
