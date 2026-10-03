-- Disposable database checks for paired Mercury internal-transfer posting.
do $$
declare
	test_group_id uuid := gen_random_uuid();
	checking_id uuid := gen_random_uuid();
	savings_id uuid := gen_random_uuid();
	credit_id uuid := gen_random_uuid();
	connection_id uuid := gen_random_uuid();
	checking_provider_id uuid := gen_random_uuid();
	savings_provider_id uuid := gen_random_uuid();
	credit_provider_id uuid := gen_random_uuid();
	other_provider_id uuid := gen_random_uuid();
	outgoing_id uuid := gen_random_uuid();
	incoming_id uuid := gen_random_uuid();
	credit_outgoing_id uuid := gen_random_uuid();
	credit_incoming_id uuid := gen_random_uuid();
	unmapped_outgoing_id uuid := gen_random_uuid();
	unmapped_incoming_id uuid := gen_random_uuid();
	external_outgoing_id uuid := gen_random_uuid();
	external_incoming_id uuid := gen_random_uuid();
	ambiguous_outgoing_id uuid := gen_random_uuid();
	ambiguous_incoming_id uuid := gen_random_uuid();
	same_account_outgoing_id uuid := gen_random_uuid();
	same_account_incoming_id uuid := gen_random_uuid();
	disabled_outgoing_id uuid := gen_random_uuid();
	disabled_incoming_id uuid := gen_random_uuid();
	locked_outgoing_id uuid := gen_random_uuid();
	locked_incoming_id uuid := gen_random_uuid();
	corrected_outgoing_id uuid := gen_random_uuid();
	corrected_incoming_id uuid := gen_random_uuid();
	posted_id uuid;
	credit_posted_id uuid;
	result jsonb;
	line_total bigint;
	refresh_count integer;
begin
	insert into public.groups values (test_group_id, 'Mercury transfer test', 'mercury-transfer-test');
	insert into public.group_accounting_settings(group_id, currency) values (test_group_id, 'usd');
	insert into public.group_accounting_accounts(
		id, group_id, code, name, kind, subtype, normal_side, display_group
	) values
		(checking_id, test_group_id, '1000', 'Checking', 'asset', 'bank', 'debit', 'Cash'),
		(savings_id, test_group_id, '1010', 'Savings', 'asset', 'bank', 'debit', 'Cash'),
		(credit_id, test_group_id, '2100', 'Mercury Card', 'liability', 'credit_card', 'credit', 'Liabilities');
	insert into public.group_accounting_bank_connections(id, group_id, provider, display_name, status)
	values (connection_id, test_group_id, 'mercury', 'Mercury', 'connected');
	insert into public.group_accounting_provider_accounts(
		id, group_id, connection_id, account_id, provider, external_account_id, display_name, is_enabled
	) values
		(checking_provider_id, test_group_id, connection_id, checking_id, 'mercury', 'mercury-checking', 'Checking', true),
		(savings_provider_id, test_group_id, connection_id, savings_id, 'mercury', 'mercury-savings', 'Savings', true),
		(credit_provider_id, test_group_id, connection_id, credit_id, 'mercury', 'mercury-credit', 'Mercury Card', true),
		(other_provider_id, test_group_id, connection_id, checking_id, 'mercury', 'mercury-other', 'Other', true);
	insert into public.group_accounting_bank_feed_items(
		id, group_id, connection_id, account_id, provider, source_transaction_id,
		transaction_date, description, amount_cents, currency, status, provider_status, raw
	) values
		(outgoing_id, test_group_id, connection_id, checking_id, 'mercury', 'transfer-out',
			'2026-04-22', 'Internal transfer', -100000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","account":{"id":"mercury-checking"}}'),
		(incoming_id, test_group_id, connection_id, savings_id, 'mercury', 'transfer-in',
			'2026-04-22', 'Internal transfer', 100000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","accountId":"mercury-savings"}');

	refresh_count := public.refresh_group_accounting_mercury_feed_raw(
		test_group_id,
		connection_id,
		jsonb_build_array(
			jsonb_build_object(
				'source_transaction_id', 'transfer-out', 'account_id', checking_id,
				'should_import', true,
				'raw', '{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-22T10:00:00Z","account":{"id":"mercury-checking"},"counterpartyId":"mercury-savings"}'::jsonb
			),
			jsonb_build_object(
				'source_transaction_id', 'transfer-in', 'account_id', savings_id,
				'should_import', true,
				'raw', '{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-22T10:00:00Z","accountId":"mercury-savings","counterpartyId":"mercury-checking"}'::jsonb
			)
		)
	);
	if refresh_count is distinct from 2 then raise exception 'Raw-only Mercury metadata updates were not persisted'; end if;

	result := public.post_group_accounting_mercury_internal_transfer_pair(test_group_id, outgoing_id, incoming_id);
	if result->>'posted' is distinct from 'true' then raise exception 'Valid internal transfer was not posted: %', result; end if;
	posted_id := (result->>'entry_id')::uuid;
	if (select count(*) from public.group_accounting_entries where id = posted_id and entry_type = 'transfer' and status = 'posted') <> 1 then
		raise exception 'Transfer entry was not created as one posted transfer';
	end if;
	if (select count(*) from public.group_accounting_lines where group_accounting_lines.entry_id = posted_id) <> 2 then
		raise exception 'Transfer entry does not have exactly two account lines';
	end if;
	select sum(debit_cents::bigint - credit_cents::bigint) into line_total
	from public.group_accounting_lines where group_accounting_lines.entry_id = posted_id and account_id = savings_id;
	if line_total is distinct from 100000 then raise exception 'Destination account has the wrong signed amount'; end if;
	select sum(debit_cents::bigint - credit_cents::bigint) into line_total
	from public.group_accounting_lines where group_accounting_lines.entry_id = posted_id and account_id = checking_id;
	if line_total is distinct from -100000 then raise exception 'Source account has the wrong signed amount'; end if;
	if (select count(*) from public.group_accounting_bank_feed_items
		where id in (outgoing_id, incoming_id) and status = 'posted' and matched_entry_id = posted_id) <> 2 then
		raise exception 'Both feed rows were not linked to the same transfer entry';
	end if;
	result := public.post_group_accounting_mercury_internal_transfer_pair(test_group_id, outgoing_id, incoming_id);
	if result->>'idempotent_replay' is distinct from 'true' or result->>'entry_id' is distinct from posted_id::text then
		raise exception 'Repeated pair posting was not idempotent';
	end if;
	if not exists (
		select 1 from public.group_accounting_audit_events
		where group_accounting_audit_events.group_id = test_group_id and event_type = 'mercury_internal_transfer_auto_posted' and entity_id = posted_id
	) then raise exception 'Auto-post audit event is missing'; end if;
	refresh_count := public.refresh_group_accounting_mercury_feed_raw(
		test_group_id,
		connection_id,
		jsonb_build_array(jsonb_build_object(
			'source_transaction_id', 'transfer-out', 'account_id', checking_id,
			'should_import', true,
			'raw', '{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-22T10:00:00Z","account":{"id":"mercury-checking"},"counterpartyId":"mercury-savings","memo":"later provider detail"}'::jsonb
		))
	);
	if refresh_count is distinct from 0 or exists (
		select 1 from public.group_accounting_bank_feed_items
		where id = outgoing_id and raw->>'memo' = 'later provider detail'
	) then raise exception 'A raw-only refresh changed a posted feed row'; end if;
	insert into public.group_accounting_bank_feed_items(
		id, group_id, connection_id, account_id, provider, source_transaction_id,
		transaction_date, description, amount_cents, currency, status, provider_status, raw
	) values
		(credit_outgoing_id, test_group_id, connection_id, checking_id, 'mercury', 'credit-transfer-out',
			'2026-05-01', 'Internal transfer', -55000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-05-01T10:00:00Z","accountId":"mercury-checking","counterpartyId":"mercury-credit"}'),
		(credit_incoming_id, test_group_id, connection_id, credit_id, 'mercury', 'credit-transfer-in',
			'2026-05-01', 'Internal transfer', 55000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-05-01T10:00:00Z","accountId":"mercury-credit","counterpartyId":"mercury-checking"}');
	result := public.post_group_accounting_mercury_internal_transfer_pair(test_group_id, credit_outgoing_id, credit_incoming_id);
	if result->>'posted' is distinct from 'true' then raise exception 'Asset-to-liability transfer was not posted: %', result; end if;
	credit_posted_id := (result->>'entry_id')::uuid;
	select sum(debit_cents::bigint - credit_cents::bigint) into line_total
	from public.group_accounting_lines where group_accounting_lines.entry_id = credit_posted_id and account_id = credit_id;
	if line_total is distinct from 55000 then raise exception 'Liability account received the wrong signed amount'; end if;
	select sum(debit_cents::bigint - credit_cents::bigint) into line_total
	from public.group_accounting_lines where group_accounting_lines.entry_id = credit_posted_id and account_id = checking_id;
	if line_total is distinct from -55000 then raise exception 'Source asset account has the wrong signed amount'; end if;
	insert into public.group_accounting_bank_feed_items(
		id, group_id, connection_id, account_id, provider, source_transaction_id,
		transaction_date, description, amount_cents, currency, status, provider_status, raw
	) values
		(unmapped_outgoing_id, test_group_id, connection_id, checking_id, 'mercury', 'unmapped-out',
			'2026-04-23', 'Internal transfer', -50000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-23T10:00:00Z","accountId":"unmapped-checking","counterpartyId":"unmapped-savings"}'),
		(unmapped_incoming_id, test_group_id, connection_id, savings_id, 'mercury', 'unmapped-in',
			'2026-04-23', 'Internal transfer', 50000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-23T10:00:00Z","accountId":"unmapped-savings","counterpartyId":"unmapped-checking"}'),
		(external_outgoing_id, test_group_id, connection_id, checking_id, 'mercury', 'external-out',
			'2026-04-24', 'External transfer', -25000, 'usd', 'needs_review', 'sent',
			'{"kind":"externalTransfer","status":"sent","postedAt":"2026-04-24T10:00:00Z","accountId":"mercury-checking","counterpartyId":"mercury-savings"}'),
		(external_incoming_id, test_group_id, connection_id, savings_id, 'mercury', 'external-in',
			'2026-04-24', 'External transfer', 25000, 'usd', 'needs_review', 'sent',
			'{"kind":"externalTransfer","status":"sent","postedAt":"2026-04-24T10:00:00Z","accountId":"mercury-savings","counterpartyId":"mercury-checking"}'),
		(ambiguous_outgoing_id, test_group_id, connection_id, checking_id, 'mercury', 'ambiguous-out',
			'2026-04-22', 'Internal transfer', -100000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-22T10:00:00Z","accountId":"mercury-checking","counterpartyId":"mercury-savings"}'),
		(ambiguous_incoming_id, test_group_id, connection_id, savings_id, 'mercury', 'ambiguous-in',
			'2026-04-22', 'Internal transfer', 100000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-22T10:00:00Z","accountId":"mercury-savings","counterpartyId":"mercury-checking"}'),
		(same_account_outgoing_id, test_group_id, connection_id, checking_id, 'mercury', 'same-account-out',
			'2026-04-25', 'Internal transfer', -30000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-25T10:00:00Z","accountId":"mercury-checking","counterpartyId":"mercury-other"}'),
		(same_account_incoming_id, test_group_id, connection_id, checking_id, 'mercury', 'same-account-in',
			'2026-04-25', 'Internal transfer', 30000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-25T10:00:00Z","accountId":"mercury-other","counterpartyId":"mercury-checking"}'),
		(disabled_outgoing_id, test_group_id, connection_id, checking_id, 'mercury', 'disabled-out',
			'2026-04-26', 'Internal transfer', -35000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-26T10:00:00Z","accountId":"mercury-checking","counterpartyId":"mercury-savings"}'),
		(disabled_incoming_id, test_group_id, connection_id, savings_id, 'mercury', 'disabled-in',
			'2026-04-26', 'Internal transfer', 35000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-26T10:00:00Z","accountId":"mercury-savings","counterpartyId":"mercury-checking"}'),
		(locked_outgoing_id, test_group_id, connection_id, checking_id, 'mercury', 'locked-out',
			'2026-04-27', 'Internal transfer', -40000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-27T10:00:00Z","accountId":"mercury-checking","counterpartyId":"mercury-savings"}'),
		(locked_incoming_id, test_group_id, connection_id, savings_id, 'mercury', 'locked-in',
			'2026-04-27', 'Internal transfer', 40000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-27T10:00:00Z","accountId":"mercury-savings","counterpartyId":"mercury-checking"}'),
		(corrected_outgoing_id, test_group_id, connection_id, checking_id, 'mercury', 'corrected-out',
			'2026-04-28', 'Internal transfer', -45000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-28T10:00:00Z","accountId":"mercury-checking","counterpartyId":"mercury-savings"}'),
		(corrected_incoming_id, test_group_id, connection_id, savings_id, 'mercury', 'corrected-in',
			'2026-04-28', 'Internal transfer', 45000, 'usd', 'needs_review', 'sent',
			'{"kind":"internalTransfer","status":"sent","postedAt":"2026-04-28T10:00:00Z","accountId":"mercury-savings","counterpartyId":"mercury-checking"}');
	result := public.post_group_accounting_mercury_internal_transfer_pair(test_group_id, unmapped_outgoing_id, unmapped_incoming_id);
	if result->>'posted' is distinct from 'false' or result->>'reason' is distinct from 'accounts_unmapped_or_ambiguous' then
		raise exception 'Unmapped accounts were not held for review: %', result;
	end if;
	result := public.post_group_accounting_mercury_internal_transfer_pair(test_group_id, external_outgoing_id, external_incoming_id);
	if result->>'posted' is distinct from 'false' or result->>'reason' is distinct from 'transfer_not_final' then
		raise exception 'External transfers were not held for review: %', result;
	end if;
	result := public.post_group_accounting_mercury_internal_transfer_pair(test_group_id, ambiguous_outgoing_id, ambiguous_incoming_id);
	if result->>'posted' is distinct from 'false' or result->>'reason' is distinct from 'ambiguous_transfer_pair' then
		raise exception 'Ambiguous transfers were not held for review: %', result;
	end if;
	result := public.post_group_accounting_mercury_internal_transfer_pair(test_group_id, same_account_outgoing_id, same_account_incoming_id);
	if result->>'posted' is distinct from 'false' or result->>'reason' is distinct from 'accounts_unmapped_or_ambiguous' then
		raise exception 'Transfers mapped to one ledger account were not held for review: %', result;
	end if;
	update public.group_accounting_bank_connections set status = 'disabled' where id = connection_id;
	result := public.post_group_accounting_mercury_internal_transfer_pair(test_group_id, disabled_outgoing_id, disabled_incoming_id);
	update public.group_accounting_bank_connections set status = 'connected' where id = connection_id;
	if result->>'posted' is distinct from 'false' or result->>'reason' is distinct from 'connection_not_active' then
		raise exception 'Disabled connections were not held for review: %', result;
	end if;
	insert into public.group_accounting_reconciliations(
		group_id, account_id, statement_ending_date, statement_ending_balance_cents, status
	) values (test_group_id, checking_id, '2026-04-30', 0, 'completed');
	result := public.post_group_accounting_mercury_internal_transfer_pair(test_group_id, locked_outgoing_id, locked_incoming_id);
	if result->>'posted' is distinct from 'false' or result->>'reason' is distinct from 'date_locked_by_reconciliation' then
		raise exception 'Reconciled dates were not held for review: %', result;
	end if;
	update public.group_accounting_bank_feed_items set provider_correction_pending = true where id = corrected_incoming_id;
	result := public.post_group_accounting_mercury_internal_transfer_pair(test_group_id, corrected_outgoing_id, corrected_incoming_id);
	if result->>'posted' is distinct from 'false' or result->>'reason' is distinct from 'feed_pair_not_reviewable' then
		raise exception 'Correction-pending feeds were not held for review: %', result;
	end if;
	if (select count(*) from public.group_accounting_entries where group_id = test_group_id) <> 2
		or (select count(*) from public.group_accounting_bank_feed_items where id in (
			unmapped_outgoing_id, unmapped_incoming_id, external_outgoing_id, external_incoming_id,
			ambiguous_outgoing_id, ambiguous_incoming_id, same_account_outgoing_id, same_account_incoming_id,
			disabled_outgoing_id, disabled_incoming_id, locked_outgoing_id, locked_incoming_id,
			corrected_outgoing_id, corrected_incoming_id
		) and status = 'needs_review') <> 14 then
		raise exception 'Ineligible transfers changed the ledger or feed status';
	end if;
	if has_function_privilege('authenticated', 'public.post_group_accounting_mercury_internal_transfer_pair(uuid,uuid,uuid)', 'execute') then
		raise exception 'Transfer auto-post RPC is client-callable';
	end if;
	if has_function_privilege('authenticated', 'public.refresh_group_accounting_mercury_feed_raw(uuid,uuid,jsonb)', 'execute') then
		raise exception 'Mercury feed refresh RPC is client-callable';
	end if;
	raise notice 'Mercury internal-transfer posting checks passed';
end $$;
