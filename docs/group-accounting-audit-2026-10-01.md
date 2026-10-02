# Group accounting audit — October 1, 2026

The audit covers the group accounting schema, manager authorization, entries and
corrections, reports, CSV import/export, bank feeds, provider synchronization,
reconciliation, receipts, public snapshots, and their Svelte interfaces. Changes
are local and uncommitted. Production initially supplied read-only reference data;
after the user authorized production repairs, three Mercury metadata records
were corrected and logged on October 2. Ledger entries were not changed.

## Production reference

The `3-feet-please` group currently has 27 ledger accounts, 65 posted entries,
and 64 posted manual bank feed items. Every entry has at least two lines and
balances. No cross-group ledger lines or duplicate matches were found in the
production integrity queries. There are no public snapshots for this group;
public publishing is disabled. Private accounting tables have RLS enabled and
no grants to anonymous or authenticated clients; their app access goes through
verified manager authorization and the service client.

The three Mercury provider account records have incomplete names and balance
metadata. Their account types include transaction kinds such as `externalTransfer`
and `interestPayment`; those are not account types. Two map to Checking and
Savings and one is unmapped. The three synthetic records were repaired: invalid
account types and unsupported zero balances are now unknown (`null`), and their
names have distinct identifier suffixes. Each repair includes private before/after
audit data. Both existing mappings were preserved; the third remains unmapped. There
are no Mercury feed items in the current reference dataset. A group-specific
encrypted Mercury key exists; no key or bank credentials are included here.

For January 1 through October 1, 2026, the reference ledger has $0 income,
$418.04 expenses, and $10,610.81 assets/net assets. Its balance-sheet equity
must include activity from prior years, independently of the selected activity
report window. These are recorded book values, not a verification against an
external bank statement or a live bank balance.

## Concrete corrections

| Area                  | Issue and correction                                                                                                                                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Posting and reversals | Separate header/line writes and reversal/void writes could leave incomplete books after failures. Service-only PostgreSQL RPCs now post balanced lines, update bank feed state, reverse originals, and write audit events in one transaction. Group locks serialize concurrent workflows.                                              |
| Integrity             | Cross-group foreign keys and raw writes could bypass app checks. New triggers validate group references, enforce balanced posted records, preserve account kinds with activity, prevent deletion of posted history, and protect reconciled entries and lines.                                                                          |
| Corrections           | Editing could commit only some header/line changes; a legacy replacement action voided the original before validating its replacement. Supported edits now use an atomic RPC, and the unsafe unused action was removed.                                                                                                                |
| Reporting             | Supabase row limits could silently omit ledger entries/lines. Complete report reads are paginated. Position equity uses cumulative activity. Voided originals remain in the accounting history alongside their dated reversals.                                                                                                        |
| Matching              | Equal absolute amounts could match unrelated accounts or opposite directions. Matching checks signed ledger movements, accounts, currencies, and dates. A unique index prevents reuse of the same entry/account while allowing the two sides of a transfer.                                                                            |
| Reconciliation        | Invalid values could become zero, checked rows were insufficiently scoped, and completion could leave partial clears/locks. The server validates inputs; an atomic RPC calculates the balance and validates account, dates, and checked rows before clearing activity and locking the books. Drafts do not clear activity.             |
| Public privacy        | Visibility flags hid only the displayed sections while the complete JSON remained public. Public read and publication allowlists remove hidden sections and internal fields. A database trigger protects direct API reads, redacts legacy rows, and makes snapshots immutable except for publication status.                           |
| CSV exports           | Report-type filtering split quoted CSV by newlines and commas, losing quoted sections and multiline names. It now parses CSV records before filtering. Spreadsheet text is protected against formula execution.                                                                                                                        |
| CSV imports           | IDs depended on filenames and row positions and were not account-scoped. Stable bank IDs or account/date/amount/description fingerprints with occurrence numbers now support renamed/reordered exports and preserve identical rows. Legacy imports are included in duplicate detection.                                                |
| Budgets               | Annual actuals could accidentally use the unrelated selected report period. Budget actuals now use the budget year independently of report filters.                                                                                                                                                                                    |
| Provider sync         | Stripe and Mercury reads could stop at the first page; Financial Connections dropped account mappings and accepted an arbitrary completion session. Provider reads paginate, session completion is group-scoped, and account mapping is retained. Stripe fees are imported separately from gross activity.                             |
| Mercury isolation     | The per-group key requirement and exclusion from global cron are preserved. Transaction kinds no longer overwrite bank account types; synthetic account metadata does not replace richer provider data.                                                                                                                                |
| Browser data          | Accounting preferences and connection data sent to the browser are filtered to keep stored provider credentials on the server.                                                                                                                                                                                                         |
| UI                    | Review counts use the full server count; void/reversal states are visible; statement reconciliation is exposed; public reports respect separate activity/position/budget choices, include liabilities and retained activity, use snapshot currency, and have report links. Unsupported verification and billing claims were corrected. |

## Deployment order

Deploy the application and these migrations as one coordinated release. On the current main-branch deployment flow, push starts the production app build; apply all three migrations immediately after the push, in this order:

1. `20261002010000_harden_group_accounting_integrity.sql`
2. `20261002020000_enforce_accounting_snapshot_visibility.sql`
3. `20261002030000_atomic_accounting_workflows.sql`

The application deliberately has no fallback to the old multi-request posting
path, and the integrity triggers reject the old multi-request writes. Avoid
letting either side run alone longer than the release requires. None of these
migrations were applied to production during this audit.
Check for existing unmatched references or duplicate entry/account matches in
other environments before migration. The unique-index check passed against
the current production reference. The privacy migration retains published
historical values and removes fields that the publisher hid; it does not
regenerate historical reports from today's ledger.

## Validation and remaining limits

The PostgreSQL integration test uses a disposable local database. It exercises
failed posting rollback, signed bank posting, cross-group rejection, incomplete
edit rollback, reversals, simultaneous reversal requests, deferred balance
checks, draft and completed reconciliation, backdated posting rejection,
locked edits/line additions, audit creation, public redaction, snapshot
immutability, and RPC privileges. Run it with
`ACCOUNTING_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/postgres npm test`.
Without that explicit local URL, the database test skips; regular tests never
load production credentials or mutate production.

No live provider refresh, bank linking, new charge, payout, report publication,
or production reconciliation was performed. Provider behavior is covered by
fixtures and primary API documentation, and still needs a controlled staging
test against enabled Stripe/Mercury integrations after deployment. The current
production Mercury records now accurately indicate unknown types/balances;
a verified refresh and mapping review are still needed to supply real bank
metadata. Deploy the provider fix before another manual Mercury sync to prevent
the old code from recreating the bad metadata. Foreign currency activity needs review; the module does not
perform exchange conversion and must not mix currencies in posted books.

Receipt classification is based on metadata and manager review, not OCR or
document-content verification. Ledger posting and object storage cannot share
a database transaction. Failed receipt uploads after posting report that the
transaction was saved, and receipts can be attached to existing entries without
recording the money again. Reporting presets and budgets use calendar periods;
the fiscal start-month setting does not yet implement a complete fiscal-year
closing workflow. CSVs without stable bank transaction identifiers cannot
fully distinguish duplicate exports from separate identical transactions.

The ledger display shows the most recent 500 entries; report totals and CSV
exports paginate the complete dataset. Receipt and audit lists also show recent
records. Financial Connections and Mercury malformed-row skips still need
more detailed user-visible diagnostics.

Stripe's published transaction-data pricing was checked against its
[Financial Connections page](https://stripe.com/financial-connections). The
application's note describes the published pricing unit and links to pricing;
it does not promise which party's balance will be charged.

Final verification: 165 tests passed including the isolated PostgreSQL integration
test. Svelte checking completed with zero errors or warnings, the production
build succeeded, and scoped ESLint and whitespace checks passed.
Desktop/mobile fixture screenshots were inspected for manager reports,
banking, and public snapshots. Production verification after repair still found
65 entries, zero unbalanced entries, and three repair audit events. Schema migrations and application deployment must be released together
because the current production app uses the old posting sequence.
