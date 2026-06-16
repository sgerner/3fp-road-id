create index if not exists group_accounting_audit_events_actor_user_idx
	on public.group_accounting_audit_events (actor_user_id);

create index if not exists group_accounting_bank_feed_items_account_idx
	on public.group_accounting_bank_feed_items (account_id);

create index if not exists group_accounting_bank_feed_items_connection_idx
	on public.group_accounting_bank_feed_items (connection_id);

create index if not exists group_accounting_bank_feed_items_matched_entry_idx
	on public.group_accounting_bank_feed_items (matched_entry_id);

create index if not exists group_accounting_bank_feed_items_reconciliation_idx
	on public.group_accounting_bank_feed_items (reconciliation_id);

create index if not exists group_accounting_bank_feed_items_suggested_account_idx
	on public.group_accounting_bank_feed_items (suggested_account_id);

create index if not exists group_accounting_bank_feed_items_group_account_date_idx
	on public.group_accounting_bank_feed_items (group_id, account_id, transaction_date desc);

create index if not exists group_accounting_bank_feed_items_group_unreviewed_idx
	on public.group_accounting_bank_feed_items (group_id, transaction_date desc, created_at desc)
	where status = 'needs_review';

create index if not exists group_accounting_budgets_account_idx
	on public.group_accounting_budgets (account_id);

create index if not exists group_accounting_entries_created_by_user_idx
	on public.group_accounting_entries (created_by_user_id);

create index if not exists group_accounting_entries_reversed_entry_idx
	on public.group_accounting_entries (reversed_entry_id);

create index if not exists group_accounting_entries_group_status_date_idx
	on public.group_accounting_entries (group_id, status, entry_date desc, created_at desc);

create index if not exists group_accounting_exports_created_by_user_idx
	on public.group_accounting_exports (created_by_user_id);

create index if not exists group_accounting_exports_group_created_idx
	on public.group_accounting_exports (group_id, created_at desc);

create index if not exists group_accounting_lines_entry_idx
	on public.group_accounting_lines (entry_id);

create index if not exists group_accounting_lines_account_idx
	on public.group_accounting_lines (account_id);

create index if not exists group_accounting_lines_reconciliation_idx
	on public.group_accounting_lines (reconciliation_id);

create index if not exists group_accounting_lines_group_entry_idx
	on public.group_accounting_lines (group_id, entry_id);

create index if not exists group_accounting_provider_accounts_account_idx
	on public.group_accounting_provider_accounts (account_id);

create index if not exists group_accounting_provider_accounts_connection_idx
	on public.group_accounting_provider_accounts (connection_id);

create index if not exists group_accounting_public_reports_published_by_user_idx
	on public.group_accounting_public_reports (published_by_user_id);

create index if not exists group_accounting_receipts_duplicate_idx
	on public.group_accounting_receipts (duplicate_of_receipt_id);

create index if not exists group_accounting_receipts_entry_idx
	on public.group_accounting_receipts (entry_id);

create index if not exists group_accounting_receipts_uploaded_by_user_idx
	on public.group_accounting_receipts (uploaded_by_user_id);

create index if not exists group_accounting_reconciliations_account_idx
	on public.group_accounting_reconciliations (account_id);

create index if not exists group_accounting_reconciliations_completed_by_user_idx
	on public.group_accounting_reconciliations (completed_by_user_id);

create index if not exists group_accounting_reconciliations_group_idx
	on public.group_accounting_reconciliations (group_id, account_id, statement_ending_date desc);
