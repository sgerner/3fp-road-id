create index if not exists group_accounting_mercury_feed_pair_lookup_idx
	on public.group_accounting_bank_feed_items (group_id, connection_id, transaction_date, currency, amount_cents)
	where provider = 'mercury';

-- The regular feed upsert intentionally avoids changing a review row when only
-- provider metadata changed. Refresh redacted Mercury raw payloads separately so
-- a later-arriving counterpartyId or postedAt can make a transfer pair eligible.
create or replace function public.refresh_group_accounting_mercury_feed_raw(
	p_group_id uuid,
	p_connection_id uuid,
	p_rows jsonb
) returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
	incoming record;
	connection_row public.group_accounting_bank_connections;
	updated_count integer := 0;
begin
	if p_group_id is null or p_connection_id is null then
		raise exception 'Invalid Mercury feed refresh request.';
	end if;
	if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
		raise exception 'Invalid Mercury feed refresh request.';
	end if;
	if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 100 then
		raise exception 'Invalid Mercury feed refresh request.';
	end if;

	perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
	select * into connection_row
	from public.group_accounting_bank_connections
	where id = p_connection_id and group_id = p_group_id and provider = 'mercury'
	for share;
	if not found or connection_row.status <> 'connected' then
		return 0;
	end if;

	for incoming in
		select * from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as item (
			source_transaction_id text,
			account_id uuid,
			should_import boolean,
			raw jsonb
		)
	loop
		if coalesce(incoming.should_import, false) is not true
			or nullif(btrim(incoming.source_transaction_id), '') is null
			or coalesce(jsonb_typeof(incoming.raw), '') <> 'object' then
			continue;
		end if;

		update public.group_accounting_bank_feed_items feed
		set raw = incoming.raw,
			account_id = coalesce(feed.account_id, incoming.account_id)
		where feed.group_id = p_group_id
			and feed.connection_id = p_connection_id
			and feed.provider = 'mercury'
			and feed.source_transaction_id = incoming.source_transaction_id
			and feed.status = 'needs_review'
			and feed.matched_entry_id is null
			and not feed.provider_correction_pending
			and feed.reconciliation_id is null
			and feed.cleared_at is null
			and (feed.raw is distinct from incoming.raw
				or (feed.account_id is null and incoming.account_id is not null));
		if found then updated_count := updated_count + 1; end if;
	end loop;

	return updated_count;
end;
$$;

revoke all on function public.refresh_group_accounting_mercury_feed_raw(uuid, uuid, jsonb)
	from public, anon, authenticated;
grant execute on function public.refresh_group_accounting_mercury_feed_raw(uuid, uuid, jsonb)
	to service_role;

create or replace function public.post_group_accounting_mercury_internal_transfer_pair(
	p_group_id uuid,
	p_outgoing_feed_item_id uuid,
	p_incoming_feed_item_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
	outgoing public.group_accounting_bank_feed_items;
	incoming public.group_accounting_bank_feed_items;
	connection_row public.group_accounting_bank_connections;
	outgoing_provider_account public.group_accounting_provider_accounts;
	incoming_provider_account public.group_accounting_provider_accounts;
	outgoing_ledger_account public.group_accounting_accounts;
	incoming_ledger_account public.group_accounting_accounts;
	posted_entry jsonb;
	posted_date date;
	amount integer;
begin
	if p_group_id is null or p_outgoing_feed_item_id is null or p_incoming_feed_item_id is null
		or p_outgoing_feed_item_id = p_incoming_feed_item_id then
		return jsonb_build_object('posted', false, 'reason', 'invalid_pair');
	end if;

	-- Serialize candidate pairs per group. The underlying posting RPC uses this same lock.
	perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
	perform 1
	from public.group_accounting_bank_feed_items
	where group_id = p_group_id and id in (p_outgoing_feed_item_id, p_incoming_feed_item_id)
	order by id
	for update;

	select * into outgoing
	from public.group_accounting_bank_feed_items
	where group_id = p_group_id and id = p_outgoing_feed_item_id;
	select * into incoming
	from public.group_accounting_bank_feed_items
	where group_id = p_group_id and id = p_incoming_feed_item_id;
	if outgoing.id is null or incoming.id is null then
		return jsonb_build_object('posted', false, 'reason', 'feed_pair_missing');
	end if;

	if outgoing.status = 'posted' and incoming.status = 'posted'
		and outgoing.matched_entry_id is not null
		and outgoing.matched_entry_id = incoming.matched_entry_id then
		return jsonb_build_object(
			'posted', false,
			'idempotent_replay', true,
			'entry_id', outgoing.matched_entry_id
		);
	end if;

	if outgoing.provider <> 'mercury' or incoming.provider <> 'mercury'
		or outgoing.connection_id is null or outgoing.connection_id <> incoming.connection_id
		or outgoing.status <> 'needs_review' or incoming.status <> 'needs_review'
		or outgoing.matched_entry_id is not null or incoming.matched_entry_id is not null
		or outgoing.provider_correction_pending or incoming.provider_correction_pending
		or outgoing.cleared_at is not null or incoming.cleared_at is not null
		or outgoing.reconciliation_id is not null or incoming.reconciliation_id is not null then
		return jsonb_build_object('posted', false, 'reason', 'feed_pair_not_reviewable');
	end if;

	if lower(coalesce(outgoing.provider_status, '')) <> 'sent'
		or lower(coalesce(incoming.provider_status, '')) <> 'sent'
		or lower(coalesce(outgoing.raw->>'status', '')) <> 'sent'
		or lower(coalesce(incoming.raw->>'status', '')) <> 'sent'
		or lower(coalesce(outgoing.raw->>'kind', '')) <> 'internaltransfer'
		or lower(coalesce(incoming.raw->>'kind', '')) <> 'internaltransfer' then
		return jsonb_build_object('posted', false, 'reason', 'transfer_not_final');
	end if;

	if outgoing.amount_cents >= 0 or incoming.amount_cents <= 0
		or outgoing.amount_cents::bigint + incoming.amount_cents::bigint <> 0
		or outgoing.amount_cents = -2147483648
		or outgoing.currency <> incoming.currency
		or outgoing.transaction_date <> incoming.transaction_date then
		return jsonb_build_object('posted', false, 'reason', 'transfer_amount_or_date_mismatch');
	end if;

	if coalesce(outgoing.raw->>'accountId', outgoing.raw->>'account_id', outgoing.raw->'account'->>'id')
		is distinct from coalesce(incoming.raw->>'counterpartyId', incoming.raw->>'counterparty_id', incoming.raw->>'counterpartyAccountId', incoming.raw->>'counterparty_account_id', incoming.raw->'counterpartyAccount'->>'id', incoming.raw->'counterparty'->>'id')
		or coalesce(incoming.raw->>'accountId', incoming.raw->>'account_id', incoming.raw->'account'->>'id')
		is distinct from coalesce(outgoing.raw->>'counterpartyId', outgoing.raw->>'counterparty_id', outgoing.raw->>'counterpartyAccountId', outgoing.raw->>'counterparty_account_id', outgoing.raw->'counterpartyAccount'->>'id', outgoing.raw->'counterparty'->>'id') then
		return jsonb_build_object('posted', false, 'reason', 'transfer_accounts_not_reciprocal');
	end if;

	if coalesce(outgoing.raw->>'postedAt', outgoing.raw->>'posted_at') !~ '^\d{4}-\d{2}-\d{2}T'
		or coalesce(incoming.raw->>'postedAt', incoming.raw->>'posted_at') !~ '^\d{4}-\d{2}-\d{2}T' then
		return jsonb_build_object('posted', false, 'reason', 'transfer_posted_date_missing');
	end if;
	begin
		posted_date := left(coalesce(outgoing.raw->>'postedAt', outgoing.raw->>'posted_at'), 10)::date;
		if posted_date is distinct from outgoing.transaction_date
			or left(coalesce(incoming.raw->>'postedAt', incoming.raw->>'posted_at'), 10)::date is distinct from incoming.transaction_date then
			return jsonb_build_object('posted', false, 'reason', 'transfer_posted_date_mismatch');
		end if;
	exception when others then
		return jsonb_build_object('posted', false, 'reason', 'transfer_posted_date_invalid');
	end;

	if (
		select count(*) from public.group_accounting_bank_feed_items candidate
		where candidate.group_id = p_group_id
			and candidate.connection_id = outgoing.connection_id
			and candidate.provider = 'mercury'
			and candidate.amount_cents = outgoing.amount_cents
			and candidate.currency = outgoing.currency
			and candidate.transaction_date = outgoing.transaction_date
			and lower(coalesce(candidate.provider_status, '')) = 'sent'
			and lower(coalesce(candidate.raw->>'status', '')) = 'sent'
			and lower(coalesce(candidate.raw->>'kind', '')) = 'internaltransfer'
			and coalesce(candidate.raw->>'accountId', candidate.raw->>'account_id', candidate.raw->'account'->>'id') = coalesce(outgoing.raw->>'accountId', outgoing.raw->>'account_id', outgoing.raw->'account'->>'id')
			and coalesce(candidate.raw->>'counterpartyId', candidate.raw->>'counterparty_id', candidate.raw->>'counterpartyAccountId', candidate.raw->>'counterparty_account_id', candidate.raw->'counterpartyAccount'->>'id', candidate.raw->'counterparty'->>'id') = coalesce(outgoing.raw->>'counterpartyId', outgoing.raw->>'counterparty_id', outgoing.raw->>'counterpartyAccountId', outgoing.raw->>'counterparty_account_id', outgoing.raw->'counterpartyAccount'->>'id', outgoing.raw->'counterparty'->>'id')
	) <> 1 or (
		select count(*) from public.group_accounting_bank_feed_items candidate
		where candidate.group_id = p_group_id
			and candidate.connection_id = incoming.connection_id
			and candidate.provider = 'mercury'
			and candidate.amount_cents = incoming.amount_cents
			and candidate.currency = incoming.currency
			and candidate.transaction_date = incoming.transaction_date
			and lower(coalesce(candidate.provider_status, '')) = 'sent'
			and lower(coalesce(candidate.raw->>'status', '')) = 'sent'
			and lower(coalesce(candidate.raw->>'kind', '')) = 'internaltransfer'
			and coalesce(candidate.raw->>'accountId', candidate.raw->>'account_id', candidate.raw->'account'->>'id') = coalesce(incoming.raw->>'accountId', incoming.raw->>'account_id', incoming.raw->'account'->>'id')
			and coalesce(candidate.raw->>'counterpartyId', candidate.raw->>'counterparty_id', candidate.raw->>'counterpartyAccountId', candidate.raw->>'counterparty_account_id', candidate.raw->'counterpartyAccount'->>'id', candidate.raw->'counterparty'->>'id') = coalesce(incoming.raw->>'counterpartyId', incoming.raw->>'counterparty_id', incoming.raw->>'counterpartyAccountId', incoming.raw->>'counterparty_account_id', incoming.raw->'counterpartyAccount'->>'id', incoming.raw->'counterparty'->>'id')
	) <> 1 then
		return jsonb_build_object('posted', false, 'reason', 'ambiguous_transfer_pair');
	end if;

	select * into connection_row
	from public.group_accounting_bank_connections
	where id = outgoing.connection_id and group_id = p_group_id and provider = 'mercury'
	for share;
	if not found or connection_row.status <> 'connected' then
		return jsonb_build_object('posted', false, 'reason', 'connection_not_active');
	end if;

	select * into outgoing_provider_account
	from public.group_accounting_provider_accounts
	where group_id = p_group_id
		and connection_id = outgoing.connection_id
		and provider = 'mercury'
		and external_account_id = coalesce(outgoing.raw->>'accountId', outgoing.raw->>'account_id', outgoing.raw->'account'->>'id')
		and is_enabled
	for share;
	select * into incoming_provider_account
	from public.group_accounting_provider_accounts
	where group_id = p_group_id
		and connection_id = incoming.connection_id
		and provider = 'mercury'
		and external_account_id = coalesce(incoming.raw->>'accountId', incoming.raw->>'account_id', incoming.raw->'account'->>'id')
		and is_enabled
	for share;
	if outgoing_provider_account.id is null or incoming_provider_account.id is null
		or outgoing_provider_account.account_id is null or incoming_provider_account.account_id is null
		or outgoing_provider_account.account_id = incoming_provider_account.account_id
		or outgoing_provider_account.account_id is distinct from outgoing.account_id
		or incoming_provider_account.account_id is distinct from incoming.account_id then
		return jsonb_build_object('posted', false, 'reason', 'accounts_unmapped_or_ambiguous');
	end if;

	select * into outgoing_ledger_account
	from public.group_accounting_accounts
	where id = outgoing_provider_account.account_id and group_id = p_group_id and not is_archived
	for share;
	select * into incoming_ledger_account
	from public.group_accounting_accounts
	where id = incoming_provider_account.account_id and group_id = p_group_id and not is_archived
	for share;
	if outgoing_ledger_account.id is null or incoming_ledger_account.id is null
		or outgoing_ledger_account.kind not in ('asset', 'liability')
		or incoming_ledger_account.kind not in ('asset', 'liability') then
		return jsonb_build_object('posted', false, 'reason', 'accounts_not_postable');
	end if;
	if not exists (
		select 1 from public.group_accounting_settings
		where group_id = p_group_id and lower(currency) = lower(outgoing.currency)
	) then
		return jsonb_build_object('posted', false, 'reason', 'currency_not_configured');
	end if;
	if exists (
		select 1 from public.group_accounting_reconciliations
		where group_id = p_group_id and status = 'completed'
			and statement_ending_date >= outgoing.transaction_date
			and account_id in (outgoing_ledger_account.id, incoming_ledger_account.id)
	) then
		return jsonb_build_object('posted', false, 'reason', 'date_locked_by_reconciliation');
	end if;

	amount := abs(outgoing.amount_cents);
	posted_entry := public.group_accounting_post_entry(
		p_group_id,
		jsonb_build_object(
			'entry_date', outgoing.transaction_date,
			'entry_type', 'transfer',
			'status', 'posted',
			'source', 'bank_feed',
			'source_id', outgoing.id,
			'description', left('Internal transfer: ' || outgoing_ledger_account.name || ' to ' || incoming_ledger_account.name, 200),
			'amount_cents', amount,
			'currency', outgoing.currency,
			'metadata', jsonb_build_object(
				'feed_account_id', outgoing.account_id,
				'mercury_internal_transfer', true,
				'paired_feed_item_id', incoming.id
			)
		),
		jsonb_build_array(
			jsonb_build_object('account_id', incoming.account_id, 'debit_cents', amount, 'credit_cents', 0),
			jsonb_build_object('account_id', outgoing.account_id, 'debit_cents', 0, 'credit_cents', amount)
		)
	);

	update public.group_accounting_bank_feed_items
	set status = 'posted', matched_entry_id = (posted_entry->>'id')::uuid
	where id = incoming.id and group_id = p_group_id and status = 'needs_review' and matched_entry_id is null;
	if not found then
		raise exception 'The paired Mercury activity changed while posting.';
	end if;

	insert into public.group_accounting_audit_events(
		group_id, actor_user_id, event_type, entity_type, entity_id, after_json, metadata
	) values (
		p_group_id,
		null,
		'mercury_internal_transfer_auto_posted',
		'entry',
		(posted_entry->>'id')::uuid,
		jsonb_build_object(
			'entry_id', posted_entry->>'id',
			'outgoing_feed_item_id', outgoing.id,
			'incoming_feed_item_id', incoming.id,
			'outgoing_account_id', outgoing.account_id,
			'incoming_account_id', incoming.account_id,
			'amount_cents', amount,
			'currency', outgoing.currency
		),
		jsonb_build_object('provider', 'mercury', 'automatic', true)
	);

	update public.group_accounting_sync_runs run
	set metadata = run.metadata || jsonb_build_object(
		'auto_posted_internal_transfers',
		coalesce(nullif(run.metadata->>'auto_posted_internal_transfers', '')::integer, 0) + 1
	)
	from public.group_accounting_bank_connections connection
	where connection.id = outgoing.connection_id
		and run.id = connection.sync_lease_id
		and run.status = 'running';

	return jsonb_build_object('posted', true, 'entry_id', posted_entry->>'id');
end;
$$;

revoke all on function public.post_group_accounting_mercury_internal_transfer_pair(uuid, uuid, uuid)
	from public, anon, authenticated;
grant execute on function public.post_group_accounting_mercury_internal_transfer_pair(uuid, uuid, uuid)
	to service_role;
