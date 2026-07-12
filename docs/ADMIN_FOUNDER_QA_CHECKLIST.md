# Admin Founder QA Checklist (Phase 7H.1)

Run through this on https://admin.brainbrew.dev. Tick each; note anything off for
the next feedback pass. Use a **test** puzzle/pack for any mutation — never
canonical live content.

## Authentication (the fixed area — please stress this)
- [ ] Sign in in your **normal browser** (not Incognito).
- [ ] Sign in in **Incognito**.
- [ ] Stay signed in, come back **after an hour+** → still works (no bounce to login).
- [ ] Sign out → redirected to login with "signed out".
- [ ] Sign in again immediately.
- [ ] Click **"Trouble signing in? Reset session"** on /login → clears, re-login works.
- [ ] Sign in with a **non-admin** account → see the /account "not authorized" page → "Sign out and use another account".

## Navigation & performance
- [ ] Each page loads quickly (grouped sidebar, active-page highlight).
- [ ] Loading skeletons appear, no layout jump.
- [ ] Filters on Puzzles/Content don't reload the whole page.
- [ ] Tablet width usable.

## Puzzles
- [ ] Puzzles list: filter by category/status/reserve; pagination works.
- [ ] Open a puzzle → detail (validation, scheduled usage, stats).
- [ ] **Answer key**: visible to you (Founder), "Reveal" is audited.
- [ ] Retire an **unused** test puzzle (reason required) → succeeds; history note shown.
- [ ] Try to retire a puzzle in a **future pack** → blocked with a clear message.
- [ ] Delete an **unused test draft** (reason + type DELETE + password reauth) → succeeds, returns to list.
- [ ] Confirm delete is **not offered** for approved/scheduled/used puzzles.

## Packs
- [ ] Daily Packs list; today highlighted; "no live pack today" banner if applicable.
- [ ] (Create/schedule/publish/void: next milestone — read-only for now.)

## Other
- [ ] Content Review queue (status filter, findings).
- [ ] Categories & Engines (registry + exposure + flags).
- [ ] User Support: search by username/UUID; safe profile; mark/unmark test subject.
- [ ] Reports & Exports: download a CSV (Founder can).
- [ ] System Health; Maintenance (reauth); Incidents open/resolve; Audit log shows your actions.

## Report back
For each issue: page, what happened, what you expected, and a screenshot if handy.
This drives the next fix pass before final QA certification.
