# Accounting follow-up — October 2, 2026

The follow-up implements the eight recommendations from the accounting audit: the tenant Stripe correction, durable provider monitoring, Financial Connections refreshes, per-group Mercury scheduling, provider corrections, posting idempotency, statement-cleared reconciliation, and setup/history/fiscal-year UX.

## Tenant account correction

The user confirmed CycleSafe Coalition (`acct_1T8mh9CeGXlKkw3d`) for the primary organization and its own 3 Feet Please tenant. The group's inaccessible old account was replaced in its donation, bank connection, and provider account records, preserving the Stripe ledger mapping. Three before/after audit events record the correction. Other tenants have no global fallback and must connect separate accounts. Database guards enforce this isolation, including account-record and tenant-slug renames.

## Provider operation

Cron and manual sync use persistent runs, connection last-attempt/last-success timestamps, leases, retry backoff, and sanitized errors. Partial provider failures return HTTP 502 without discarding successful results. Financial Connections requests eligible refreshes, waits for pending completion, retries failed refreshes, and saves incremental transaction refresh cursors. Verified webhook events are matched to the configured tenant account. A pre-existing request-variable shadowing error that caused all Stripe webhook requests to fail before signature verification was fixed; the smoke test also verifies rejection of a tampered signed body. The existing hourly poll recovers missed events.

Mercury scheduling is opt-in with each group's own encrypted key. Other tenants remain off by default. Provider changes update unposted items; matched/posted changes require an audited review and preserve the books. Repeated identical acknowledged changes do not reappear. Pending or invalid activity cannot post or match. Correction review does not itself create a financial adjustment.

## Posting, reconciliation, and UI

Manual forms supply request UUIDs. Identical retries return the original entry; changed payloads under the same key fail. Receipt failures clearly distinguish saved transactions from failed attachments.

Reconciliation compares selected cleared activity with the statement, retaining outstanding deposits/checks or charges/payments. It clears and locks only selected activity. Transfers can reconcile independently on both sides. Statements are private attachments with manager-authorized short-lived downloads. Reopening requires a reason, retains other reconciliations' locks, and requires later statements to be reopened first. Earlier statements cannot be completed after a later statement, keeping cleared and outstanding snapshots consistent.

History searches and pagination run on the server. Account filters retain complete journals. Matching candidates include historical entries beyond the former 500-entry cap. Setup progress uses exact counts, and fiscal start months govern budget years, report years, and quarters.

## Verification

- 172 tests passed, including disposable PostgreSQL tests for posting/reconciliation, provider leases/backoff/corrections, tenant Stripe sharing/isolation, concurrency, private data access, and a signed localhost webhook request.
- Svelte check: zero errors and warnings. Full ESLint passes.
- Desktop (1440px) and mobile (390px) renders of seven accounting tabs used production reference data: no browser errors or horizontal overflow. Temporary preview routes were removed before release.
- A live Stripe import under the corrected connection succeeded with zero balance transactions returned; success is recorded independently of cron dispatch.
- Production has the Mercury relay configuration. The existing hourly Supabase cron is enabled. A deployed endpoint test succeeded for Stripe but returned a partial failure for Mercury before any imports; the relay client now preserves HTTP status for safe authentication/permission/rate-limit classification.
- A quiet six-hour health monitor checks actual cron results and durable provider success, alerting only on meaningful failures, recovery, or required action.
- Repository-wide Prettier checking reports existing formatting in `src/lib/server/micrositeRouting.js` and `src/lib/services/email.ts`; neither file is part of this accounting change.

Financial Connections still needs an authorized person to link the group's bank/card accounts. A logged-in Stripe dashboard does not provide bank credentials. Imported activity remains subject to accounting review; feeds never automatically post new ledger entries.

The pending-donation audit verified 75 current-account PaymentIntents, all requiring a payment method. None is confirmed paid or expired. Seven historic-account records remain inaccessible and unverified. Their statuses were preserved; age alone does not establish expiry, and no donations were cancelled or notification emails sent. The existing production Stripe webhook subscription now includes Financial Connections transaction-refresh events.

Applied schema versions:

- `20261002215520_tenant_stripe_account_ownership.sql`
- `20261003024701_monitor_group_accounting_provider_sync.sql`
- `20261003025416_group_accounting_followup_20261002.sql`
- `20261003025417_guard_shared_stripe_account_identity.sql`
- `20261003030447_guard_accounting_statement_order.sql`
