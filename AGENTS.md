# Repository Instructions

## Branching and PRs

- Never automatically commit, push, create a branch, open a pull request, merge, or alter git history.
- Treat implementation requests as authorization to edit code only; leave changes uncommitted and unpushed until the user has reviewed them and explicitly requests the git operation.
- Do not interpret an ordinary request to implement or fix something as permission to commit or push.
- `main` is protected by the "Protect main with CI" GitHub ruleset: changes reach it only through a pull request whose `verify`, `build`, and `tests` checks pass, and the ruleset has no bypass. A direct push to `main` is rejected, so a requested commit or push means a pull request.
- When asked to ship a change, create a short-lived branch before committing (this keeps local `main` equal to `origin/main`), keep each pull request to one concern, open it, wait for CI, and squash-merge only when the user asks to merge.
- Every push to `main` deploys to production after CI, and the deploy aborts unless `main` still points at the commit CI checked. Merge one pull request at a time and let its deploy finish before the next merge; back-to-back merges leave red deploy jobs for the earlier commits.
- `gh pr edit` fails in this repo (deprecated Projects GraphQL field). Update a pull request description with `gh api -X PATCH repos/sgerner/3fp-road-id/pulls/<number> -F body=@<file>`.

## Checks

- Before committing code changes, run `npm run audit`, `npm run lint`, `npm run check`, and `npm test`. Run `npm run build` followed by `npm run test:server-sanitizer` for production build or server dependency changes, and run `npm run test:stripe-webhook` for Stripe or accounting webhook changes. Use Node 24 (`package.json` engines), and run `npx playwright install chromium --only-shell` before `npm test` so mobile layout checks run against the pinned Playwright headless shell; local runs use `npm run check` (to sync SvelteKit types first), while CI runs `npm run check:ci` after `npm ci` alongside the remaining checks on pull requests.
- For Supabase migrations, triggers, RPC grants, or RLS changes, install Docker and PostgreSQL `psql` locally and use the pinned `supabase` CLI from `devDependencies` (configured in `supabase/config.toml` for PostgreSQL 17 on `127.0.0.1:54322`):
  - Boot the minimal local Supabase stack (stages `supabase/tests/baseline_pre_2025_schema.sql` plus `supabase/migrations/` in `.cache/supabase-local` without polluting `supabase/migrations/`): `node scripts/test-db.mjs --start-only`
  - Run Node unit, accounting, Road ID, group search, and Stripe ownership database tests against local Supabase: `ACCOUNTING_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test`
  - Run all Supabase migrations and SQL suites (`baseline_safety.sql`, `ride_rsvp_privacy.sql`, `event_host_group_authorization.sql`, `activity_participant_rpc_grants.sql`, and `group_accounting_*.sql`): `npm run test:db` (starts the minimal stack if stopped, or resets `.cache/supabase-local` when already running to replay the full migration history cleanly).
