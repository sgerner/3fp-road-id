do $$
declare
	g uuid := gen_random_uuid();
	cash uuid := gen_random_uuid();
	cash_older uuid := gen_random_uuid();
	cash_feed uuid := gen_random_uuid();
	cash_manual uuid := gen_random_uuid();
	cash_duplicate uuid := gen_random_uuid();
	cash_split uuid := gen_random_uuid();
	cash_description uuid := gen_random_uuid();
	cash_opening uuid := gen_random_uuid();
	card_account uuid := gen_random_uuid();
	income uuid := gen_random_uuid();
	expense uuid := gen_random_uuid();
	feed_id uuid := gen_random_uuid();
	card_feed_id uuid := gen_random_uuid();
	split_feed_id uuid := gen_random_uuid();
	entry jsonb;
	older_entry jsonb;
	feed_entry jsonb;
	card_entry jsonb;
	split_entry jsonb;
	saved jsonb;
	closed jsonb;
	reopened jsonb;
	draft_id uuid;
	duplicate_id uuid := gen_random_uuid();
	failed boolean;
begin
	insert into public.groups values (g, 'Statement reconciliation test', 'statement-reconciliation-test');
	insert into public.group_accounting_accounts(id, group_id, code, name, kind, subtype, normal_side, display_group)
	values
		(cash, g, '1000', 'Checking', 'asset', 'bank', 'debit', 'Cash'),
		(cash_older, g, '1010', 'Older item checking', 'asset', 'bank', 'debit', 'Cash'),
		(cash_feed, g, '1020', 'Feed checking', 'asset', 'bank', 'debit', 'Cash'),
		(cash_manual, g, '1030', 'Manual fallback checking', 'asset', 'bank', 'debit', 'Cash'),
		(cash_duplicate, g, '1040', 'Duplicate draft checking', 'asset', 'bank', 'debit', 'Cash'),
		(cash_split, g, '1050', 'Split feed checking', 'asset', 'bank', 'debit', 'Cash'),
		(cash_description, g, '1060', 'Description checking', 'asset', 'bank', 'debit', 'Cash'),
		(cash_opening, g, '1070', 'Opening balance checking', 'asset', 'bank', 'debit', 'Cash'),
		(card_account, g, '2000', 'Credit card', 'liability', 'credit_card', 'credit', 'Liabilities'),
		(income, g, '4000', 'Income', 'income', 'donations', 'credit', 'Income'),
		(expense, g, '5000', 'Expense', 'expense', 'other', 'debit', 'Expenses');

	-- An uncertain OCR draft can be saved, resumed, and corrected later without
	-- silently clearing activity or requiring extracted amounts to balance yet.
	failed := false;
	begin
		perform public.group_accounting_save_reconciliation_draft(
			g, cash, null, '2026-01-01', '2026-01-31', 0, 0, null, 'EUR',
			jsonb_build_array(jsonb_build_object(
				'clientId', 'wrong-currency', 'transactionDate', '2026-01-10', 'description', 'Wrong currency',
				'amountCents', 0, 'currency', 'EUR', 'resolution', 'approved_exception', 'reason', 'Currency validation check'
			)), null
		);
	exception when others then failed := sqlerrm like 'Statement currency must match the group accounting currency.%';
	end;
	if not failed then raise exception 'A statement with currency differing from group settings was saved.'; end if;
	saved := public.group_accounting_save_reconciliation_draft(
		g, cash, null, '2026-01-01', '2026-01-31', 10000, 99999, null, 'USD',
		jsonb_build_array(jsonb_build_object(
			'clientId', 'ocr-row-1', 'transactionDate', null, 'description', 'Uncertain OCR row',
			'amountCents', null, 'resolution', 'pending'
		)), null
	);
	draft_id := (saved->>'id')::uuid;
	if saved->>'status' <> 'draft' or saved->>'verification_status' <> 'pending'
		or saved->>'verification_mode' <> 'statement'
		or saved->>'statement_currency' <> 'USD'
		or (saved->>'statement_balance_delta_cents')::bigint = 0
		or (select transaction_date from public.group_accounting_reconciliation_statement_lines where reconciliation_id = draft_id) is not null
	then raise exception 'Incomplete statement draft was not saved as pending evidence.'; end if;
	if (select currency from public.group_accounting_reconciliation_statement_lines where reconciliation_id = draft_id) <> 'USD' then
		raise exception 'A statement line did not retain its effective currency.';
	end if;
	update public.group_accounting_reconciliations set statement_currency = 'EUR' where id = draft_id;
	failed := false;
	begin
		perform public.group_accounting_close_reconciliation(g, draft_id, '{}'::uuid[], '{}'::uuid[], null);
	exception when others then failed := sqlerrm like 'The saved statement currency must match the group accounting currency.%';
	end;
	if not failed then raise exception 'Close accepted a saved statement currency differing from group settings.'; end if;
	update public.group_accounting_reconciliations set statement_currency = 'USD' where id = draft_id;
	failed := false;
	begin
		perform public.group_accounting_close_reconciliation(g, draft_id, '{}'::uuid[], '{}'::uuid[], null);
	exception when others then failed := true;
	end;
	if not failed or (select status from public.group_accounting_reconciliations where id = draft_id) <> 'draft' then
		raise exception 'An incomplete statement draft was closed.';
	end if;

	-- A posted ledger entry from an earlier period can clear on this statement.
	older_entry := public.group_accounting_post_entry(g,
		jsonb_build_object('entry_date', '2026-02-15', 'entry_type', 'expense', 'description', 'Outstanding check'),
		jsonb_build_array(
			jsonb_build_object('account_id', expense, 'debit_cents', 200, 'credit_cents', 0),
			jsonb_build_object('account_id', cash_older, 'debit_cents', 0, 'credit_cents', 200)
		)
	);
	saved := public.group_accounting_save_reconciliation_draft(
		g, cash_older, null, '2026-03-01', '2026-03-31', 0, -200, null, 'USD',
		jsonb_build_array(jsonb_build_object(
			'clientId', 'older-check', 'transactionDate', '2026-03-10', 'description', 'Outstanding check',
			'amountCents', -200, 'entryId', older_entry->>'id', 'resolution', 'matched'
		)), null
	);
	draft_id := (saved->>'id')::uuid;
	if (select reason from public.group_accounting_reconciliation_line_matches where reconciliation_id = draft_id)
		is distinct from 'No bank-feed item was linked; this line was matched to the ledger entry directly.' then
		raise exception 'Ledger-only match did not retain a visible missing-feed explanation.';
	end if;
	saved := public.group_accounting_save_reconciliation_draft(
		g, cash_older, draft_id, '2026-03-01', '2026-03-31', 0, -200, null, 'USD',
		jsonb_build_array(jsonb_build_object(
			'clientId', 'older-check', 'transactionDate', '2026-03-10', 'description', 'Outstanding check reviewed',
			'amountCents', -200, 'entryId', older_entry->>'id', 'resolution', 'matched'
		)), null
	);
	if not exists (
		select 1 from public.group_accounting_reconciliation_line_decisions
		where reconciliation_id = draft_id and before_json->>'description' = 'Outstanding check'
			and after_json->>'description' = 'Outstanding check reviewed'
	) then raise exception 'An evidence-only statement-line edit was not recorded in decision history.'; end if;
	failed := false;
	begin
		perform public.group_accounting_complete_reconciliation(
			g, cash_older, '2026-03-31', -200, '{}'::uuid[], array[(older_entry->>'id')::uuid], null, null
		);
	exception when others then failed := true;
	end;
	if not failed or (select status from public.group_accounting_reconciliations where id = draft_id) <> 'draft'
		or (select locked_at from public.group_accounting_entries where id = (older_entry->>'id')::uuid) is not null then
		raise exception 'The legacy completion RPC bypassed the explicit statement close guard.';
	end if;
	closed := public.group_accounting_close_reconciliation(g, draft_id, '{}'::uuid[], array[(older_entry->>'id')::uuid], null);
	if closed->>'status' <> 'completed' or closed->>'verification_status' <> 'qualified'
		or (select locked_at from public.group_accounting_entries where id = (older_entry->>'id')::uuid) is null
		or (select status from public.group_accounting_reconciliations where id = draft_id) <> 'completed' then
		raise exception 'Earlier-period ledger activity did not close with a qualified verification status.';
	end if;
	failed := false;
	begin
		update public.group_accounting_reconciliation_line_decisions
		set reason = 'tampered' where reconciliation_id = draft_id;
	exception when others then failed := true;
	end;
	if not failed then raise exception 'Statement-line decision history was mutable.'; end if;
	reopened := public.group_accounting_reopen_reconciliation(g, draft_id, null, 'Reviewing the cleared item');
	if reopened->>'status' <> 'draft' or reopened->>'verification_status' <> 'pending'
		or (select locked_at from public.group_accounting_entries where id = (older_entry->>'id')::uuid) is not null then
		raise exception 'Reopened statement reconciliation retained a verified status or locked entry.';
	end if;
	closed := public.group_accounting_close_reconciliation(g, draft_id, '{}'::uuid[], array[(older_entry->>'id')::uuid], null);
	if closed->>'status' <> 'completed' then raise exception 'Reopened reconciliation could not be explicitly closed again.'; end if;
	saved := public.group_accounting_save_reconciliation_draft(
		g, cash_older, null, '2026-03-15', '2026-04-30', -200, -200, null, 'USD',
		jsonb_build_array(jsonb_build_object(
			'clientId', 'overlapping-period', 'transactionDate', '2026-04-30', 'description', 'Period overlap check',
			'amountCents', 0, 'resolution', 'approved_exception', 'reason', 'Zero-activity period check'
		)), null
	);
	draft_id := (saved->>'id')::uuid;
	failed := false;
	begin
		perform public.group_accounting_close_reconciliation(g, draft_id, '{}'::uuid[], '{}'::uuid[], null);
	exception when others then failed := sqlerrm like 'The statement period overlaps a previous completed reconciliation.%';
	end;
	if not failed or (select status from public.group_accounting_reconciliations where id = draft_id) <> 'draft' then
		raise exception 'A statement period overlapping a previous completed close was accepted.';
	end if;

	-- A normal, matched feed and ledger row with exact statement evidence closes
	-- as verified and locks the entry through the established accounting RPC.
	insert into public.group_accounting_bank_feed_items(
		id, group_id, account_id, provider, source_transaction_id, transaction_date,
		description, amount_cents, status
	) values (feed_id, g, cash_feed, 'manual', 'statement-test-feed', '2026-04-10', 'Deposit', 300, 'needs_review');
	feed_entry := public.group_accounting_post_entry(g,
		jsonb_build_object('entry_date', '2026-04-10', 'entry_type', 'income', 'source', 'bank_feed',
			'source_id', feed_id, 'description', 'Deposit', 'metadata', jsonb_build_object('feed_account_id', cash_feed)),
		jsonb_build_array(
			jsonb_build_object('account_id', cash_feed, 'debit_cents', 300, 'credit_cents', 0),
			jsonb_build_object('account_id', income, 'debit_cents', 0, 'credit_cents', 300)
		)
	);
	saved := public.group_accounting_save_reconciliation_draft(
		g, cash_feed, null, '2026-04-01', '2026-04-30', 0, 300, null, 'USD',
		jsonb_build_array(jsonb_build_object(
			'clientId', 'feed-deposit', 'transactionDate', '2026-04-10', 'description', 'Deposit',
			'amountCents', 300, 'feedItemId', feed_id, 'entryId', feed_entry->>'id', 'resolution', 'matched'
		)), null
	);
	draft_id := (saved->>'id')::uuid;
	closed := public.group_accounting_close_reconciliation(g, draft_id, array[feed_id], array[(feed_entry->>'id')::uuid], null);
	if closed->>'status' <> 'completed' or closed->>'verification_status' <> 'verified'
		or (select reconciliation_id from public.group_accounting_bank_feed_items where id = feed_id) is distinct from draft_id then
		raise exception 'Matched statement, feed, and ledger evidence did not close as verified.';
	end if;

	-- Credit-card provider amounts use cash-flow polarity, while statement
	-- balances use the liability account's normal credit side. A 10-day feed lag
	-- remains matchable inside the shared 14-day tolerance.
	insert into public.group_accounting_bank_feed_items(
		id, group_id, account_id, provider, source_transaction_id, transaction_date,
		description, amount_cents, status
	) values (card_feed_id, g, card_account, 'manual', 'statement-test-card', '2026-07-20', 'Card purchase', -400, 'needs_review');
	card_entry := public.group_accounting_post_entry(g,
		jsonb_build_object('entry_date', '2026-07-20', 'entry_type', 'expense', 'source', 'bank_feed',
			'source_id', card_feed_id, 'description', 'Card purchase', 'metadata', jsonb_build_object('feed_account_id', card_account)),
		jsonb_build_array(
			jsonb_build_object('account_id', expense, 'debit_cents', 400, 'credit_cents', 0),
			jsonb_build_object('account_id', card_account, 'debit_cents', 0, 'credit_cents', 400)
		)
	);
	saved := public.group_accounting_save_reconciliation_draft(
		g, card_account, null, '2026-07-01', '2026-07-31', 0, 400, null, 'USD',
		jsonb_build_array(jsonb_build_object(
			'clientId', 'card-purchase', 'transactionDate', '2026-07-10', 'description', 'Card purchase',
			'amountCents', 400, 'feedItemId', card_feed_id, 'entryId', card_entry->>'id', 'resolution', 'matched'
		)), null
	);
	draft_id := (saved->>'id')::uuid;
	closed := public.group_accounting_close_reconciliation(g, draft_id, array[card_feed_id], array[(card_entry->>'id')::uuid], null);
	if closed->>'status' <> 'completed' or closed->>'verification_status' <> 'verified' then
		raise exception 'Credit-card feed polarity or 14-day settlement matching failed.';
	end if;

	-- A provider feed can represent the combined value of several statement
	-- lines allocated to one ledger entry. Each line carries the split flag, and
	-- the aggregate must equal both the feed amount and ledger account effect.
	insert into public.group_accounting_bank_feed_items(
		id, group_id, account_id, provider, source_transaction_id, transaction_date,
		description, amount_cents, status
	) values (split_feed_id, g, cash_split, 'manual', 'statement-test-split', '2026-08-10', 'Combined payment', -100, 'needs_review');
	split_entry := public.group_accounting_post_entry(g,
		jsonb_build_object('entry_date', '2026-08-10', 'entry_type', 'expense', 'source', 'bank_feed',
			'source_id', split_feed_id, 'description', 'Combined payment', 'metadata', jsonb_build_object('feed_account_id', cash_split)),
		jsonb_build_array(
			jsonb_build_object('account_id', expense, 'debit_cents', 100, 'credit_cents', 0),
			jsonb_build_object('account_id', cash_split, 'debit_cents', 0, 'credit_cents', 100)
		)
	);
	saved := public.group_accounting_save_reconciliation_draft(
		g, cash_split, null, '2026-08-01', '2026-08-31', 0, -100, null, 'USD',
		jsonb_build_array(
			jsonb_build_object('clientId', 'split-a', 'transactionDate', '2026-08-10', 'description', 'Split allocation A',
				'amountCents', -40, 'feedItemId', split_feed_id, 'entryId', split_entry->>'id', 'resolution', 'matched', 'isSplit', true),
			jsonb_build_object('clientId', 'split-b', 'transactionDate', '2026-08-10', 'description', 'Split allocation B',
				'amountCents', -60, 'feedItemId', split_feed_id, 'entryId', split_entry->>'id', 'resolution', 'matched', 'isSplit', true)
		), null
	);
	draft_id := (saved->>'id')::uuid;
	closed := public.group_accounting_close_reconciliation(g, draft_id, array[split_feed_id], array[(split_entry->>'id')::uuid], null);
	if closed->>'status' <> 'completed' or closed->>'verification_status' <> 'verified'
		or (select reconciliation_id from public.group_accounting_bank_feed_items where id = split_feed_id) is distinct from draft_id then
		raise exception 'A feed and ledger entry did not safely reconcile against aggregated split statement lines.';
	end if;
	saved := public.group_accounting_save_reconciliation_draft(
		g, cash_split, null, '2026-09-01', '2026-09-30', -100, -100, null, 'USD', '[]'::jsonb, null,
		array[split_feed_id], array[(split_entry->>'id')::uuid]
	);
	if (select checked_feed_item_ids from public.group_accounting_reconciliations where id = (saved->>'id')::uuid)
		is distinct from array[split_feed_id]
		or (select cleared_entry_ids from public.group_accounting_reconciliations where id = (saved->>'id')::uuid)
		is distinct from array[(split_entry->>'id')::uuid] then
		raise exception 'Draft selection proposals were not persisted for resume.';
	end if;

	-- An explicit balance-only close remains supported and is visibly unverified.
	saved := public.group_accounting_save_reconciliation_draft(
		g, cash_manual, null, null, '2026-05-31', null, 0, null, 'USD', '[]'::jsonb, null
	);
	draft_id := (saved->>'id')::uuid;
	closed := public.group_accounting_close_reconciliation(g, draft_id, '{}'::uuid[], '{}'::uuid[], null);
	if closed->>'status' <> 'completed' or closed->>'verification_status' <> 'unverified'
		or not exists (
			select 1 from public.group_accounting_audit_events
			where entity_id = draft_id and event_type = 'close_reconciliation_session'
				and metadata->>'unverified_attestation' = 'true'
		) then raise exception 'Balance-only explicit close was not recorded as unverified.'; end if;

	-- Non-ignored descriptions are required evidence even when an exception
	-- reason and otherwise balanced statement are present.
	saved := public.group_accounting_save_reconciliation_draft(
		g, cash_description, null, '2026-09-01', '2026-09-30', 0, 0, null, 'USD',
		jsonb_build_array(jsonb_build_object(
			'clientId', 'blank-description', 'transactionDate', '2026-09-10', 'description', '   ',
			'amountCents', 0, 'resolution', 'approved_exception', 'reason', 'Description missing in OCR'
		)), null
	);
	draft_id := (saved->>'id')::uuid;
	failed := false;
	begin
		perform public.group_accounting_close_reconciliation(g, draft_id, '{}'::uuid[], '{}'::uuid[], null);
	exception when others then failed := sqlerrm like 'Every non-ignored statement line needs a description%';
	end;
	if not failed or (select status from public.group_accounting_reconciliations where id = draft_id) <> 'draft' then
		raise exception 'A non-ignored statement line without a description was accepted.';
	end if;

	-- If the legacy calculation returns a draft because the cleared ledger
	-- balance does not yet include the provided opening balance, explicit close
	-- must raise instead of appearing to have succeeded.
	saved := public.group_accounting_save_reconciliation_draft(
		g, cash_opening, null, '2026-10-01', '2026-10-31', 500, 600, null, 'USD',
		jsonb_build_array(jsonb_build_object(
			'clientId', 'opening-amount', 'transactionDate', '2026-10-10', 'description', 'Opening balance amount',
			'amountCents', 100, 'resolution', 'approved_exception', 'reason', 'No ledger opening balance was posted'
		)), null
	);
	draft_id := (saved->>'id')::uuid;
	failed := false;
	begin
		perform public.group_accounting_close_reconciliation(g, draft_id, '{}'::uuid[], '{}'::uuid[], null);
	exception when others then failed := sqlerrm like 'The ledger balance does not equal the statement balance%';
	end;
	if not failed or (select status from public.group_accounting_reconciliations where id = draft_id) <> 'draft' then
		raise exception 'An incomplete legacy ledger calculation returned apparent close success.';
	end if;

	-- Duplicate draft rows must stop the old RPC from updating the wrong one.
	saved := public.group_accounting_save_reconciliation_draft(
		g, cash_duplicate, null, null, '2026-06-30', null, 0, null, 'USD', '[]'::jsonb, null
	);
	draft_id := (saved->>'id')::uuid;
	insert into public.group_accounting_reconciliations(
		id, group_id, account_id, statement_ending_date, statement_ending_balance_cents,
		status, verification_mode, verification_status
	) values (duplicate_id, g, cash_duplicate, '2026-06-30', 0, 'draft', 'balance_only', 'pending');
	failed := false;
	begin
		perform public.group_accounting_close_reconciliation(g, draft_id, '{}'::uuid[], '{}'::uuid[], null);
	exception when others then failed := sqlerrm like 'Resolve duplicate drafts%';
	end;
	if not failed or (select count(*) from public.group_accounting_reconciliations
		where group_id = g and account_id = cash_duplicate and status = 'draft') <> 2 then
		raise exception 'Duplicate reconciliation drafts were not safely rejected.';
	end if;

	if has_function_privilege('anon', 'public.group_accounting_save_reconciliation_draft(uuid,uuid,uuid,date,date,integer,integer,jsonb,text,jsonb,uuid,uuid[],uuid[])', 'execute')
		or has_function_privilege('authenticated', 'public.group_accounting_close_reconciliation(uuid,uuid,uuid[],uuid[],uuid)', 'execute')
		or not has_function_privilege('service_role', 'public.group_accounting_save_reconciliation_draft(uuid,uuid,uuid,date,date,integer,integer,jsonb,text,jsonb,uuid,uuid[],uuid[])', 'execute')
	then raise exception 'Statement reconciliation RPC grants are incorrect.'; end if;
	if not (select relrowsecurity from pg_class where oid = 'public.group_accounting_reconciliation_statement_lines'::regclass)
		or not (select relrowsecurity from pg_class where oid = 'public.group_accounting_reconciliation_line_matches'::regclass)
		or not (select relrowsecurity from pg_class where oid = 'public.group_accounting_reconciliation_line_decisions'::regclass)
	then raise exception 'Statement reconciliation evidence tables must enable RLS.'; end if;
end;
$$;

select 'statement reconciliation database checks passed';
