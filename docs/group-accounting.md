# Group Accounting Module

Group accounting lives at `/groups/[slug]/manage/accounting` and gives group owners/admins a plain-language cash-basis accounting system backed by double-entry records.

## Goals

- Keep the UI understandable for small volunteer groups.
- Store real balanced accounting entries under the hood.
- Support income, expenses, transfers, budgets, reports, receipts, bank feeds, reconciliation, and fixed public financial snapshots.
- Prefer simple words in the UI: "money in", "money out", "move money", "buckets", "what we have", and "what we owe".

## Core Tables

- `group_accounting_settings`: group accounting config, public report defaults, encrypted provider setup.
- `group_accounting_accounts`: chart of accounts, shown as buckets/categories.
- `group_accounting_entries`: transaction headers.
- `group_accounting_lines`: double-entry lines.
- `group_accounting_budgets`: annual and optional monthly budgets.
- `group_accounting_bank_connections`: Stripe, Stripe Financial Connections, Mercury, and CSV/manual feed connections.
- `group_accounting_provider_accounts`: external bank/card accounts mapped to ledger accounts.
- `group_accounting_bank_feed_items`: imported feed activity waiting for review, matched, posted, or ignored.
- `group_accounting_reconciliations`: statement reconciliation sessions.
- `group_accounting_receipts`: private receipt files and classification metadata.
- `group_accounting_public_reports`: immutable public snapshots.
- `group_accounting_audit_events`: audit log for corrections, sync, imports, and reconciliation.
- `group_accounting_exports`: export audit records.

## Required Environment

Existing required app variables still apply:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_CONNECT_CLIENT_ID`
- `STRIPE_CONNECT_STATE_SECRET` or `STRIPE_SECRET_KEY`
- `SOCIAL_TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET` or `CRON_AUTH_TOKEN` or `VERCEL_CRON_SECRET`
- `MERCURY_RELAY_URL`
- `MERCURY_RELAY_SHARED_SECRET`
- `MERCURY_RELAY_ENCRYPTION_KEY_B64`
- `MERCURY_API_TOKEN` if the group has not saved a Mercury key in accounting settings

`SOCIAL_TOKEN_ENCRYPTION_KEY` is used for encrypted Mercury/Financial Connections metadata compatibility and must resolve to 32 bytes. The existing social token helper accepts a 64-character hex key, a base64 32-byte key, or hashes an arbitrary secret into a 32-byte key.

## Stripe Financial Connections

Bank and credit-card account linking uses Stripe Financial Connections, not direct Plaid. Stripe may use Plaid behind the scenes, but this app only talks to Stripe.

Flow:

1. Manager clicks "Connect bank or card".
2. Server creates a Financial Connections Session for the group's connected Stripe account.
3. Client launches `stripe.collectFinancialConnectionsAccounts({ clientSecret })`.
4. Server completes the session, stores linked accounts, imports transactions, and auto-matches feed items.

Stripe Financial Connections Transactions pricing is currently documented by Stripe as `$0.30` per institution per account holder per month. Keep this note visible in the UI because small groups may be sensitive to recurring costs.

The group must already have a Stripe connected account through the existing donation setup before Financial Connections can be used.

## Mercury

Each group can store its own Mercury API key from the accounting settings panel. The key is encrypted before storage.
Mercury sync requests are sent through the Mercury relay configured by `MERCURY_RELAY_URL`; the app signs relay requests with `MERCURY_RELAY_SHARED_SECRET` and encrypts the per-group Mercury key with `MERCURY_RELAY_ENCRYPTION_KEY_B64`.
If no per-group Mercury key is saved, sync falls back to `MERCURY_API_TOKEN`.

Sync imports:

- Mercury accounts into `group_accounting_provider_accounts`.
- Mercury transactions into `group_accounting_bank_feed_items`.
- Auto-match suggestions after import.

## Stripe Balance Sync

Stripe balance transaction sync is separate from Financial Connections. It imports processor-side activity for the group's connected Stripe donation account, including payouts and fees when Stripe exposes them through balance transactions.

## CSV Import/Export

CSV import turns common bank CSV columns into reviewable feed items. Supported header names include:

- `date`, `transaction date`, `posted date`, `post date`
- `processed date`
- `description`, `name`, `memo`, `payee`
- `amount`, or `debit`/`credit`
- `credit or debit`, `debit or credit`, `transaction type`, `type`

CSV export is available at:

`/api/groups/[slug]/accounting/export/entries.csv`

## Reconciliation

Reconciliation supports:

- Auto-matching feed items to posted entries by amount and nearby date.
- Marking matched feed items as checked activity.
- Statement ending balance comparison.
- Completing reconciliation when the difference is zero.
- Locking entries through the statement date after a zero-difference reconciliation.

Corrections should be made with reversal entries rather than destructive edits.

## Corrections and Audit

Entries are voided by reversal. This keeps the ledger auditable and avoids changing historical books after reports or reconciliations are published.

Audit events are written for:

- voids
- receipt classification
- CSV imports
- auto-match runs
- reconciliations

## Receipts

Receipts upload to the private `group-accounting-receipts` bucket. Current classification is deterministic metadata review plus manager correction fields. The schema supports extracted text and extracted fields so OCR/AI extraction can be added without another schema change.

## Public Reports

Public reports are fixed snapshots. Publishing a snapshot stores the report JSON at that moment; later accounting edits do not mutate the public report.

Public links use:

`/groups/[slug]/reports/[reportSlug]`

Managers can choose which parts of the snapshot to expose:

- activity report
- position report
- budgets
- cash totals
- notes

## Scheduled Sync

Cron endpoint:

`POST /api/cron/group-accounting-sync`

Authorization follows the shared Supabase cron-secret pattern:

- `Authorization: Bearer $CRON_SECRET`, or
- `x-vercel-cron-secret: $CRON_SECRET`

The production job is scheduled in Supabase as `group-accounting-sync-hourly` and uses the
`private.cron_secrets.group_accounting_sync` secret.

The cron attempts, per group:

- Stripe Financial Connections transaction sync
- Mercury transaction sync
- Stripe balance transaction sync
- auto-match

Provider errors are returned per group without failing the whole cron run.

## Feature Coverage

Implemented:

- default chart of accounts
- simple income/expense entry
- transfers
- advanced journal
- opening balances
- budgets
- P&L/activity report
- balance/position report
- monthly dashboard stats
- receipt upload and review
- CSV import/export
- Stripe donation auto-posting
- Stripe balance sync
- Stripe Financial Connections bank/card sync
- Mercury sync
- auto-match
- reconciliation and locking
- void-by-reversal
- audit trail
- public fixed snapshots
- public report permalinks
- scheduled feed sync

Operational setup still required outside code:

- Enable Stripe Financial Connections on the Stripe account/platform.
- Confirm the connected-account flow is allowed for the platform's Stripe account.
- Configure Stripe webhook coverage if future real-time Financial Connections refresh events are needed.
- Add the cron endpoint to the deployment scheduler.
- Provide live Mercury API keys per group.
- Run Supabase migrations in every environment.
