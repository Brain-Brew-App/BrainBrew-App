# Admin Exports (Phase 7H)

Privacy-safe, audited CSV exports via a server Route Handler
(`/api/export/[dataset]`), listed on `/reports`.

## Datasets (aggregate only)
- `gameplay-daily` — day, ranked/practice starts & completions, avg/median score
- `user-daily` — day, new/permanent/anonymous, active users
- `engine` — engine, exposures, players, completions, avg points, perfect/zero rate
- `content-inventory` — engine, category, active, approved/reserve/scheduled counts

## Guarantees
- **Role-gated** on `export_reports` (Founder, Product, Finance). Viewer/Investor can
  view reports but not export.
- **Field allowlist per dataset** — no emails, user UUIDs, tokens, answers, provider
  ids, or audit IP hashes ever leave.
- **CSV-injection safe** — cells starting `= + - @` are neutralized; quotes escaped.
- UTF-8 with BOM; a `# ...` data-as-of header (dataset, UTC range, generated-at, rows).
- Row cap (5000) + 400-day range cap; `Cache-Control: no-store`.
- Every download writes an `export_csv` audit row.

Large async exports (background generation) are a future enhancement; current
exports are bounded and synchronous.
