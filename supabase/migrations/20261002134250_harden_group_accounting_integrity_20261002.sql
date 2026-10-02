-- Posting a header and its lines must commit together. This also makes
-- reversals safe under concurrent requests and a failed follow-up write.
create unique index group_accounting_feed_unique_entry_account
on public.group_accounting_bank_feed_items(group_id,matched_entry_id,account_id)
where matched_entry_id is not null and account_id is not null and status in ('matched','posted');

-- Accounting data is accessed through the server-side API, which uses
-- service_role after checking group-manager access. Keep both reads and writes
-- off client roles so they cannot bypass atomic RPCs, audit logging, or server
-- authorization with direct PostgREST requests.
do $$
declare
	table_name text;
	policy_row record;
begin
	foreach table_name in array array[
		'group_accounting_accounts',
		'group_accounting_audit_events',
		'group_accounting_bank_connections',
		'group_accounting_bank_feed_items',
		'group_accounting_budgets',
		'group_accounting_entries',
		'group_accounting_exports',
		'group_accounting_lines',
		'group_accounting_provider_accounts',
		'group_accounting_receipts',
		'group_accounting_reconciliations',
		'group_accounting_settings'
	] loop
		if to_regclass('public.' || table_name) is not null then
			execute format('revoke all on table public.%I from anon, authenticated, public', table_name);
			for policy_row in
				select policyname from pg_policies
				where schemaname = 'public' and tablename = table_name
			loop
				execute format('drop policy if exists %I on public.%I', policy_row.policyname, table_name);
			end loop;
		end if;
	end loop;
end;
$$;

create or replace function public.group_accounting_post_entry(
	p_group_id uuid, p_entry jsonb, p_lines jsonb
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
	posted public.group_accounting_entries;
	original public.group_accounting_entries;
	original_id uuid;
	debits bigint;
	credits bigint;
	feed public.group_accounting_bank_feed_items;
	feed_account uuid;
	feed_delta bigint;
	group_currency text;
begin
	perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
	select currency into group_currency from public.group_accounting_settings where group_id=p_group_id;
	if coalesce(p_entry->>'currency','usd') <> coalesce(group_currency,'usd') then raise exception 'Use the group accounting currency.'; end if;
	if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
		raise exception 'An entry needs at least two lines.';
	end if;
	select sum((l->>'debit_cents')::bigint), sum((l->>'credit_cents')::bigint)
	into debits, credits from jsonb_array_elements(p_lines) l;
	if debits is null or debits <= 0 or debits <> credits then
		raise exception 'This entry does not balance.';
	end if;
	if exists (
		select 1 from jsonb_array_elements(p_lines) l
		left join public.group_accounting_accounts a on a.id = (l->>'account_id')::uuid
		where a.id is null or a.group_id <> p_group_id
		or (a.is_archived and coalesce(p_entry->>'source', '') <> 'reversal')
	) then raise exception 'Choose an active account belonging to this group.'; end if;
	if exists (
		select 1 from jsonb_array_elements(p_lines) l
		join public.group_accounting_reconciliations r on r.account_id = (l->>'account_id')::uuid
		where r.group_id = p_group_id and r.status = 'completed'
		and r.statement_ending_date >= (p_entry->>'entry_date')::date
	) then raise exception 'This date is locked by reconciliation.'; end if;
	if p_entry->>'source' = 'bank_feed' then
		select * into feed from public.group_accounting_bank_feed_items
		where id=(p_entry->>'source_id')::uuid and group_id=p_group_id for update;
		if not found or feed.status<>'needs_review' or feed.matched_entry_id is not null then raise exception 'This bank activity has already been handled.'; end if;
		feed_account:=(p_entry->'metadata'->>'feed_account_id')::uuid;
		select sum((l->>'debit_cents')::bigint-(l->>'credit_cents')::bigint) into feed_delta
		from jsonb_array_elements(p_lines) l where (l->>'account_id')::uuid=feed_account;
		if feed_delta is distinct from feed.amount_cents::bigint or feed.currency<>coalesce(group_currency,'usd')
			or feed.transaction_date is distinct from (p_entry->>'entry_date')::date
			or not exists(select 1 from public.group_accounting_accounts where id=feed_account and group_id=p_group_id and kind in ('asset','liability'))
		then raise exception 'The entry must match this bank activity.'; end if;
	end if;
	if p_entry->>'source' = 'reversal' then
		original_id := (p_entry->'metadata'->>'reverses_entry_id')::uuid;
		select * into original from public.group_accounting_entries
		where id = original_id and group_id = p_group_id for update;
		if not found or original.status <> 'posted' then raise exception 'Only a posted entry can be reversed.'; end if;
		if original.locked_at is not null then raise exception 'This entry is locked by reconciliation.'; end if;
		if (p_entry->>'entry_date')::date < original.entry_date then raise exception 'A reversal cannot precede the original entry.'; end if;
		if exists (
			(select account_id, debit_cents, credit_cents from public.group_accounting_lines where entry_id = original_id
			 except all select (l->>'account_id')::uuid, (l->>'credit_cents')::integer, (l->>'debit_cents')::integer from jsonb_array_elements(p_lines) l)
			union all
			(select (l->>'account_id')::uuid, (l->>'credit_cents')::integer, (l->>'debit_cents')::integer from jsonb_array_elements(p_lines) l
			 except all select account_id, debit_cents, credit_cents from public.group_accounting_lines where entry_id = original_id)
		) then raise exception 'A reversal must exactly offset the original lines.'; end if;
	end if;
	insert into public.group_accounting_entries (
		group_id, entry_date, entry_type, status, source, source_id, description,
		memo, amount_cents, currency, created_by_user_id, posted_at, metadata
	) values (
		p_group_id, (p_entry->>'entry_date')::date, p_entry->>'entry_type', coalesce(p_entry->>'status', 'posted'),
		coalesce(p_entry->>'source', 'manual'), p_entry->>'source_id', p_entry->>'description',
		p_entry->>'memo', coalesce((p_entry->>'amount_cents')::integer, debits::integer),
		coalesce(p_entry->>'currency', 'usd'), (p_entry->>'created_by_user_id')::uuid,
		case when p_entry->>'status' = 'draft' then null else now() end, coalesce(p_entry->'metadata', '{}'::jsonb)
	) returning * into posted;
	insert into public.group_accounting_lines (entry_id, group_id, account_id, description, debit_cents, credit_cents)
	select posted.id, p_group_id, (l->>'account_id')::uuid, coalesce(l->>'description', posted.description),
		(l->>'debit_cents')::integer, (l->>'credit_cents')::integer from jsonb_array_elements(p_lines) l;
	if feed.id is not null then
		update public.group_accounting_bank_feed_items set status='posted',matched_entry_id=posted.id,account_id=feed_account,
			suggested_account_id=(p_entry->'metadata'->>'feed_category_account_id')::uuid where id=feed.id;
	end if;
	if original_id is not null then
		update public.group_accounting_entries set status = 'void', voided_at = now(), reversed_entry_id = posted.id,
			metadata = metadata || jsonb_build_object('void_reason', posted.memo) where id = original_id;
		update public.group_accounting_bank_feed_items set status = 'needs_review', matched_entry_id = null,
			match_confidence = null, match_reason = null where group_id = p_group_id and matched_entry_id = original_id;
		insert into public.group_accounting_audit_events(group_id,actor_user_id,event_type,entity_type,entity_id,before_json,after_json,metadata)
		values(p_group_id,posted.created_by_user_id,'void','entry',original_id,to_jsonb(original),
			(select to_jsonb(e) from public.group_accounting_entries e where id=original_id),jsonb_build_object('reversal_id',posted.id));
	end if;
	insert into public.group_accounting_audit_events(group_id,actor_user_id,event_type,entity_type,entity_id,after_json)
	values(p_group_id,posted.created_by_user_id,'post','entry',posted.id,to_jsonb(posted)||jsonb_build_object('lines',p_lines));
	return to_jsonb(posted);
end;
$$;
revoke all on function public.group_accounting_post_entry(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.group_accounting_post_entry(uuid, jsonb, jsonb) to service_role;

-- A manager of two groups must not be able to link their private ledger rows.
create or replace function public.group_accounting_check_group_reference()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
	i integer;
	reference_id uuid;
	reference_group uuid;
begin
	perform pg_advisory_xact_lock(hashtextextended(new.group_id::text, 0));
	if tg_op = 'UPDATE' and new.group_id <> old.group_id then raise exception 'Accounting rows cannot move between groups.'; end if;
	for i in 0..tg_nargs / 2 - 1 loop
		reference_id := (to_jsonb(new)->>tg_argv[i * 2])::uuid;
		if reference_id is not null then
			execute format('select group_id from public.%I where id = $1', tg_argv[i * 2 + 1]) into reference_group using reference_id;
			if reference_group is distinct from new.group_id then raise exception 'Accounting references must belong to the same group.'; end if;
		end if;
	end loop;
	return new;
end;
$$;

create trigger group_accounting_lines_group_reference before insert or update on public.group_accounting_lines
for each row execute function public.group_accounting_check_group_reference('entry_id','group_accounting_entries','account_id','group_accounting_accounts','reconciliation_id','group_accounting_reconciliations');
create trigger group_accounting_entries_group_reference before insert or update on public.group_accounting_entries
for each row execute function public.group_accounting_check_group_reference('reversed_entry_id','group_accounting_entries');
create trigger group_accounting_budgets_group_reference before insert or update on public.group_accounting_budgets
for each row execute function public.group_accounting_check_group_reference('account_id','group_accounting_accounts');
create trigger group_accounting_feed_group_reference before insert or update on public.group_accounting_bank_feed_items
for each row execute function public.group_accounting_check_group_reference('account_id','group_accounting_accounts','suggested_account_id','group_accounting_accounts','connection_id','group_accounting_bank_connections','matched_entry_id','group_accounting_entries','reconciliation_id','group_accounting_reconciliations');
create trigger group_accounting_provider_group_reference before insert or update on public.group_accounting_provider_accounts
for each row execute function public.group_accounting_check_group_reference('account_id','group_accounting_accounts','connection_id','group_accounting_bank_connections');
create trigger group_accounting_receipts_group_reference before insert or update on public.group_accounting_receipts
for each row execute function public.group_accounting_check_group_reference('entry_id','group_accounting_entries','duplicate_of_receipt_id','group_accounting_receipts');
create trigger group_accounting_reconciliations_group_reference before insert or update on public.group_accounting_reconciliations
for each row execute function public.group_accounting_check_group_reference('account_id','group_accounting_accounts');
create trigger group_accounting_settings_group_reference before insert or update on public.group_accounting_settings
for each row execute function public.group_accounting_check_group_reference();
create trigger group_accounting_accounts_group_reference before insert or update on public.group_accounting_accounts
for each row execute function public.group_accounting_check_group_reference();
create trigger group_accounting_connections_group_reference before insert or update on public.group_accounting_bank_connections
for each row execute function public.group_accounting_check_group_reference();

create or replace function public.group_accounting_preserve_account_kind()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
	if (new.kind<>old.kind or new.normal_side<>old.normal_side) and exists(select 1 from public.group_accounting_lines where account_id=old.id) then
		raise exception 'An account with ledger activity cannot change its accounting type.';
	end if;
	return new;
end;
$$;
create trigger group_accounting_accounts_kind before update on public.group_accounting_accounts
for each row execute function public.group_accounting_preserve_account_kind();

create or replace function public.group_accounting_validate_feed_match()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare matched public.group_accounting_entries; delta bigint;
begin
	if new.status in ('matched','posted') then
		select * into matched from public.group_accounting_entries where id=new.matched_entry_id and group_id=new.group_id;
		if not found or matched.status<>'posted' or new.account_id is null or new.currency<>matched.currency
			or abs(new.transaction_date-matched.entry_date)>7 then raise exception 'Match a posted transaction in this account, currency, and date window.'; end if;
		select sum(debit_cents::bigint-credit_cents::bigint) into delta from public.group_accounting_lines
		where entry_id=matched.id and account_id=new.account_id;
		if delta is distinct from new.amount_cents::bigint then raise exception 'Matched activity must have the same signed amount in this account.'; end if;
	end if;
	return new;
end;
$$;
create trigger group_accounting_feed_match before insert or update on public.group_accounting_bank_feed_items
for each row execute function public.group_accounting_validate_feed_match();

-- Deferred checking lets the RPC insert all lines before validating the books.
create or replace function public.group_accounting_check_balance()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare target_id uuid; target_status text; line_count bigint; difference bigint;
begin
	if tg_table_name = 'group_accounting_entries' then target_id := coalesce(new.id, old.id);
	else target_id := coalesce(new.entry_id, old.entry_id); end if;
	select status into target_status from public.group_accounting_entries where id = target_id;
	if target_status in ('posted','void') then
		select count(*), coalesce(sum(debit_cents::bigint-credit_cents::bigint),0)
		into line_count, difference from public.group_accounting_lines where entry_id = target_id;
		if line_count < 2 or difference <> 0 then raise exception 'Posted accounting entries must have balanced lines.'; end if;
	end if;
	if tg_table_name = 'group_accounting_lines' and tg_op = 'UPDATE'
		and (to_jsonb(old)->>'entry_id') is distinct from (to_jsonb(new)->>'entry_id') then
		select status into target_status from public.group_accounting_entries where id = old.entry_id;
		if target_status in ('posted','void') then
			select count(*), coalesce(sum(debit_cents::bigint-credit_cents::bigint),0) into line_count,difference
			from public.group_accounting_lines where entry_id = old.entry_id;
			if line_count < 2 or difference <> 0 then raise exception 'Posted accounting entries must have balanced lines.'; end if;
		end if;
	end if;
	return null;
end;
$$;
create constraint trigger group_accounting_entries_balanced after insert or update on public.group_accounting_entries
deferrable initially deferred for each row execute function public.group_accounting_check_balance();
create constraint trigger group_accounting_lines_balanced after insert or update or delete on public.group_accounting_lines
deferrable initially deferred for each row execute function public.group_accounting_check_balance();

create or replace function public.group_accounting_protect_locked_entry()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare target_locked timestamptz;
begin
	if tg_table_name = 'group_accounting_entries' then
		if tg_op='DELETE' and old.status in ('posted','void') and exists(select 1 from public.groups where id=old.group_id) then
			raise exception 'Posted entries must be corrected with a reversal.';
		end if;
		if old.locked_at is not null and (tg_op = 'DELETE' or
			(to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at')) then
			raise exception 'This entry is locked by reconciliation.';
		end if;
	else
		select locked_at into target_locked from public.group_accounting_entries where id = coalesce((to_jsonb(new)->>'entry_id')::uuid,(to_jsonb(old)->>'entry_id')::uuid);
		if target_locked is not null and (tg_op in ('DELETE','INSERT') or
			(to_jsonb(new)-'cleared_at'-'reconciliation_id') is distinct from (to_jsonb(old)-'cleared_at'-'reconciliation_id')) then
			raise exception 'This entry is locked by reconciliation.';
		end if;
	end if;
	if tg_op = 'DELETE' then return old; end if;
	return new;
end;
$$;
create trigger group_accounting_entries_locked before update or delete on public.group_accounting_entries
for each row execute function public.group_accounting_protect_locked_entry();
create trigger group_accounting_lines_locked before insert or update or delete on public.group_accounting_lines
for each row execute function public.group_accounting_protect_locked_entry();
