do $$
declare
	g uuid := gen_random_uuid();
	other_group uuid := gen_random_uuid();
	cash uuid := gen_random_uuid();
	income uuid := gen_random_uuid();
	foreign_cash uuid := gen_random_uuid();
	foreign_income uuid := gen_random_uuid();
	feed_id uuid := gen_random_uuid();
	foreign_feed_id uuid := gen_random_uuid();
	foreign_entry_id uuid := gen_random_uuid();
	receipt_id uuid;
	late_receipt_id uuid;
	entry jsonb;
	other_entry jsonb;
	failed boolean;
begin
	insert into public.groups values
		(g, 'Receipt test', 'receipt-test'),
		(other_group, 'Other receipt test', 'other-receipt-test');

	insert into public.group_accounting_accounts(id, group_id, code, name, kind, subtype, normal_side, display_group)
	values
		(cash, g, '1000', 'Checking', 'asset', 'bank', 'debit', 'Cash'),
		(income, g, '4000', 'Income', 'income', 'donations', 'credit', 'Income'),
		(foreign_cash, other_group, '1000', 'Other Checking', 'asset', 'bank', 'debit', 'Cash'),
		(foreign_income, other_group, '4000', 'Other Income', 'income', 'donations', 'credit', 'Income');

	insert into public.group_accounting_bank_feed_items(
		id, group_id, provider, source_transaction_id, transaction_date, description, amount_cents, currency, account_id
	) values
		(feed_id, g, 'manual', 'receipt-test-feed', '2026-10-01', 'Receipt test deposit', 1000, 'usd', cash),
		(foreign_feed_id, other_group, 'manual', 'other-receipt-test-feed', '2026-10-01', 'Other deposit', 1000, 'usd', foreign_cash);

	entry := public.group_accounting_post_entry(
		g,
		jsonb_build_object('entry_date', '2026-10-01', 'entry_type', 'income', 'source', 'test', 'description', 'Receipt-linked deposit', 'currency', 'usd'),
		jsonb_build_array(
			jsonb_build_object('account_id', cash, 'debit_cents', 1000, 'credit_cents', 0),
			jsonb_build_object('account_id', income, 'debit_cents', 0, 'credit_cents', 1000)
		)
	);

	insert into public.group_accounting_receipts(group_id, entry_id, feed_item_id, object_path, file_name, mime_type)
	values(g, null, feed_id, g || '/feed-items/' || feed_id || '/receipt.pdf', 'receipt.pdf', 'application/pdf')
	returning id into receipt_id;

	update public.group_accounting_bank_feed_items
	set status = 'posted', matched_entry_id = (entry->>'id')::uuid
	where id = feed_id and group_id = g;

	if not exists(
		select 1 from public.group_accounting_receipts
		where id = receipt_id and entry_id = (entry->>'id')::uuid and feed_item_id = feed_id
	) then
		raise exception 'Posting bank-feed activity did not link its receipt to the ledger entry.';
	end if;

	insert into public.group_accounting_receipts(group_id, feed_item_id, object_path, file_name, mime_type)
	values(g, feed_id, g || '/feed-items/' || feed_id || '/late-receipt.jpg', 'late-receipt.jpg', 'image/jpeg')
	returning id into late_receipt_id;
	if not exists(
		select 1 from public.group_accounting_receipts
		where id = late_receipt_id and entry_id = (entry->>'id')::uuid
	) then
		raise exception 'Receipt uploaded after posting was not linked to its ledger entry.';
	end if;

	other_entry := public.group_accounting_post_entry(
		g,
		jsonb_build_object('entry_date', '2026-10-01', 'entry_type', 'income', 'source', 'test', 'description', 'Other receipt test entry', 'currency', 'usd'),
		jsonb_build_array(
			jsonb_build_object('account_id', cash, 'debit_cents', 2000, 'credit_cents', 0),
			jsonb_build_object('account_id', income, 'debit_cents', 0, 'credit_cents', 2000)
		)
	);
	failed := false;
	begin
		insert into public.group_accounting_receipts(group_id, entry_id, feed_item_id, object_path, file_name)
		values(g, (other_entry->>'id')::uuid, feed_id, g || '/invalid/wrong-entry.pdf', 'wrong-entry.pdf');
	exception when others then
		failed := true;
	end;
	if not failed then raise exception 'A feed receipt was linked to the wrong posted transaction.'; end if;

	failed := false;
	begin
		insert into public.group_accounting_receipts(group_id, feed_item_id, object_path, file_name)
		values(g, foreign_feed_id, g || '/invalid/foreign.pdf', 'foreign.pdf');
	exception when others then
		failed := true;
	end;
	if not failed then raise exception 'A receipt referenced another group bank-feed item.'; end if;

	insert into public.group_accounting_entries(id, group_id, entry_date, entry_type, status, source, description)
	values(foreign_entry_id, other_group, '2026-10-01', 'income', 'draft', 'test', 'Foreign draft');
	failed := false;
	begin
		insert into public.group_accounting_receipts(group_id, entry_id, feed_item_id, object_path, file_name)
		values(g, foreign_entry_id, feed_id, g || '/invalid/cross-group.pdf', 'cross-group.pdf');
	exception when others then
		failed := true;
	end;
	if not failed then raise exception 'A receipt linked ledger and feed rows from different groups.'; end if;

	if (select public from storage.buckets where id = 'group-accounting-receipts') is distinct from false then
		raise exception 'Accounting receipts must stay in a private storage bucket.';
	end if;
	if has_function_privilege('anon', 'public.group_accounting_link_feed_receipts()', 'execute')
		or has_function_privilege('authenticated', 'public.group_accounting_link_feed_receipts()', 'execute')
		or has_function_privilege('anon', 'public.group_accounting_attach_receipt_to_feed_entry()', 'execute')
		or has_function_privilege('authenticated', 'public.group_accounting_attach_receipt_to_feed_entry()', 'execute') then
		raise exception 'Receipt-linking trigger function is directly executable by clients.';
	end if;
end;
$$;

select 'accounting receipt checks passed' as result;
