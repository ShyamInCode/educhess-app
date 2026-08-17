# Archive

Superseded documents, kept because they record *why* the current shape was
chosen. Nothing here describes the system as it is today — read
`docs/SYSTEM-OVERVIEW.md` for that.

| File | What it is |
|---|---|
| `AUDIT-REPORT.md` | Full-app security/quality audit, v1 (2026-08-11, baseline `dbfa39a`). |
| `AUDIT-VERIFICATION-QUERIES.sql` | Paste-ready SQL that checked v1's findings against the live project. |
| `AUDIT-REPORT-v2.md` | Re-audit, v2 (2026-08-11, HEAD `50bcfa0`). Its findings, RLS matrix and Client/Server Responsibility Map are the spec the frontend-only baseline was built to satisfy. |
| `AUDIT-VERIFICATION-QUERIES-v2.sql` | Paste-ready SQL for v2's findings. |
| `migrations-pre-baseline/` | Every `.sql` migration that existed before the consolidation, in the order `DEPLOYMENT.md §5` said to run them. Replaced wholesale by `supabase/01_schema.sql` … `05_seed.sql`. |
| `edge-functions-pre-baseline/` | The three Supabase Edge Functions (`send-email`, `razorpay-order`, `razorpay-webhook`) and the FastAPI service, removed when the app became frontend-only. |

## Where each v2 finding ended up

The baseline enforces these rather than leaving them to a later patch:

| Finding | Where it is handled now |
|---|---|
| SEC-01 / SEC-20 — leaked service_role + JWT secret | `RESET-AND-APPLY.md` step 1 (manual key regeneration — the only fix). |
| SEC-02 — paid videos in a public bucket | `04_storage.sql`: `course-videos` is private; reads are gated by tier through storage RLS, and the client mints short-lived signed URLs. |
| SEC-03 — unthrottled public registration | `02_functions.sql`: `register_for_event()` rate-limits per email and per user in `registration_rate_limit`, and direct INSERT on the registration tables is denied. |
| SEC-05 — unrestricted `profiles` INSERT | `03_rls.sql`: INSERT is pinned to `role='student'`, `tier='free'`, `rank_points` gone; column-level UPDATE grant is `name, grade, consent_at` only. |
| SEC-06 — ~20 inline `role='admin'` subqueries | `03_rls.sql`: every admin policy goes through `is_admin()`. Zero inline checks remain. |
| SEC-07 — `rpc_v2` re-granting `random_puzzles()` | The flat migration folder is gone; `02_functions.sql` grants EXECUTE idempotently and never to `anon`/`authenticated`. |
| DB-01 — `payments.user_id ON DELETE CASCADE` | `01_schema.sql`: `ON DELETE RESTRICT`. |
| DB-04 — lockless quota trigger | Gone. The allowance is metered at delivery under a row lock in `consume_puzzle_allowance()`; the trigger no longer exists. |
| DB-05 — unindexed FK columns | `01_schema.sql`: every FK column is indexed. |
| DB-06 — dead `quest_progress` | Dropped, with its trigger and `profiles.rank_points`. |
| ENT-01 — bypassable puzzle allowance | `02_functions.sql`: `random_puzzles_for_user()` meters delivery server-side, clamps each batch to the remaining allowance, and returns the remaining count. |
| SVR-02 — dead FastAPI bridge | Deleted; `src/lib/api.js` and `backend/` are archived here. |
| PRIV-01 — consent is UI-only | Still UI-only, now stated as a decision rather than an oversight. See `SYSTEM-OVERVIEW.md`. |
| PAY-01 / PAY-02 | Not applicable — payments are stubbed and no code processes them. |
