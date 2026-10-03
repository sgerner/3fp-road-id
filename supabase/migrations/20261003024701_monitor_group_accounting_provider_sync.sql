alter table public.group_accounting_settings
	add column if not exists mercury_sync_enabled boolean not null default false;

alter table public.group_accounting_bank_connections
	add column if not exists sync_status text not null default 'idle'
		check (sync_status in ('idle', 'running', 'pending', 'succeeded', 'partial', 'failed')),
	add column if not exists last_sync_attempt_at timestamptz,
	add column if not exists last_sync_success_at timestamptz,
	add column if not exists last_provider_refresh_at timestamptz,
	add column if not exists next_sync_at timestamptz,
	add column if not exists sync_consecutive_failures integer not null default 0
		check (sync_consecutive_failures >= 0),
	add column if not exists last_sync_error_code text,
	add column if not exists last_sync_error_message text,
	add column if not exists sync_lease_id uuid,
	add column if not exists sync_lease_expires_at timestamptz;

alter table public.group_accounting_bank_feed_items
	add column if not exists provider_status text,
	add column if not exists provider_correction_pending boolean not null default false,
	add column if not exists provider_correction jsonb,
	add column if not exists provider_correction_decision text
		check (provider_correction_decision in ('accepted', 'dismissed')),
	add column if not exists provider_correction_resolved_at timestamptz,
	add column if not exists provider_correction_resolved_by uuid references auth.users(id) on delete set null;

create table if not exists public.group_accounting_sync_runs (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	connection_id uuid references public.group_accounting_bank_connections(id) on delete set null,
	provider text not null check (provider in ('stripe', 'stripe_financial_connections', 'mercury')),
	trigger text not null check (trigger in ('manual', 'cron', 'webhook', 'system')),
	status text not null check (status in ('running', 'pending', 'succeeded', 'partial', 'failed', 'skipped')),
	started_at timestamptz not null default now(),
	completed_at timestamptz,
	inserted_count integer not null default 0 check (inserted_count >= 0),
	updated_count integer not null default 0 check (updated_count >= 0),
	correction_count integer not null default 0 check (correction_count >= 0),
	skipped_count integer not null default 0 check (skipped_count >= 0),
	error_code text,
	error_message text,
	metadata jsonb not null default '{}'::jsonb
);

create index if not exists group_accounting_sync_runs_group_provider_started_idx
	on public.group_accounting_sync_runs (group_id, provider, started_at desc);

create index if not exists group_accounting_sync_runs_connection_started_idx
	on public.group_accounting_sync_runs (connection_id, started_at desc);

create index if not exists group_accounting_bank_feed_items_provider_correction_idx
	on public.group_accounting_bank_feed_items (group_id, provider, transaction_date desc)
	where provider_correction_pending;

alter table public.group_accounting_sync_runs enable row level security;

drop policy if exists group_accounting_sync_runs_manager_select
	on public.group_accounting_sync_runs;
create policy group_accounting_sync_runs_manager_select
	on public.group_accounting_sync_runs for select
	using (public.is_group_accounting_manager(group_id));

grant select on public.group_accounting_sync_runs to authenticated, service_role;

create or replace function public.claim_group_accounting_provider_sync(
	p_group_id uuid,
	p_provider text,
	p_run_id uuid,
	p_trigger text,
	p_force boolean default false,
	p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
	connection_row public.group_accounting_bank_connections;
	sync_now timestamptz := now();
	reason text;
	connection_label text;
begin
	if p_provider not in ('stripe', 'stripe_financial_connections', 'mercury') then
		raise exception 'Unsupported accounting provider';
	end if;
	if p_trigger not in ('manual', 'cron', 'webhook', 'system') then
		raise exception 'Unsupported accounting sync trigger';
	end if;
	if p_run_id is null or p_group_id is null then
		raise exception 'A group and sync run id are required';
	end if;

	connection_label := case p_provider
		when 'mercury' then 'Mercury'
		when 'stripe_financial_connections' then 'Linked bank accounts and cards'
		else 'Stripe balance'
	end;

	insert into public.group_accounting_bank_connections (
		group_id, provider, display_name, status, config
	)
	values (
		p_group_id,
		p_provider,
		connection_label,
		'setup_needed',
		jsonb_build_object('kind', case when p_provider = 'stripe' then 'processor' else 'bank_feed' end)
	)
	on conflict (group_id, provider) do nothing;

	select * into connection_row
	from public.group_accounting_bank_connections
	where group_id = p_group_id and provider = p_provider
	for update;

	if connection_row.status = 'disabled' then
		reason := 'disabled';
	elsif connection_row.sync_lease_id is not null
		and connection_row.sync_lease_expires_at > sync_now then
		reason := 'sync_in_progress';
	elsif p_trigger = 'cron' and not coalesce(p_force, false)
		and connection_row.next_sync_at > sync_now then
		reason := 'backoff';
	end if;

	if reason is not null then
		insert into public.group_accounting_sync_runs (
			id, group_id, connection_id, provider, trigger, status, started_at, completed_at,
			error_code, error_message, metadata
		)
		values (
			p_run_id, p_group_id, connection_row.id, p_provider, p_trigger, 'skipped',
			sync_now, sync_now,
			reason,
			case reason
				when 'disabled' then 'This provider connection is disabled.'
				when 'backoff' then 'This provider is waiting before its next automatic retry.'
				else 'A sync for this provider is already in progress.'
			end,
			jsonb_build_object('retry_at', connection_row.next_sync_at)
		);
		return jsonb_build_object(
			'acquired', false,
			'reason', reason,
			'run_id', p_run_id,
			'connection_id', connection_row.id,
			'next_sync_at', connection_row.next_sync_at
		);
	end if;

	update public.group_accounting_sync_runs set status='failed',completed_at=sync_now,error_code='sync_lease_expired',error_message='The previous sync did not finish before its lease expired.'
	where id=connection_row.sync_lease_id and status='running';

	insert into public.group_accounting_sync_runs (
		id, group_id, connection_id, provider, trigger, status, started_at
	)
	values (p_run_id, p_group_id, connection_row.id, p_provider, p_trigger, 'running', sync_now);

	update public.group_accounting_bank_connections
	set sync_status = 'running',
		last_sync_attempt_at = sync_now,
		last_sync_error_code = null,
		last_sync_error_message = null,
		sync_lease_id = p_run_id,
		sync_lease_expires_at = sync_now + make_interval(secs => greatest(60, least(p_lease_seconds, 3600)))
	where id = connection_row.id;

	return jsonb_build_object(
		'acquired', true,
		'run_id', p_run_id,
		'connection_id', connection_row.id,
		'started_at', sync_now
	);
end;
$$;

create or replace function public.finish_group_accounting_provider_sync(
	p_run_id uuid,
	p_status text,
	p_inserted_count integer default 0,
	p_updated_count integer default 0,
	p_correction_count integer default 0,
	p_skipped_count integer default 0,
	p_error_code text default null,
	p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
	run_row public.group_accounting_sync_runs;
	connection_row public.group_accounting_bank_connections;
	finished_at timestamptz := now();
	failure_count integer;
	lease_owned boolean := false;
begin
	if p_status not in ('pending', 'succeeded', 'partial', 'failed') then
		raise exception 'Invalid provider sync status';
	end if;
	select * into run_row from public.group_accounting_sync_runs where id = p_run_id for update;
	if not found or run_row.status <> 'running' then
		return jsonb_build_object('recorded', false, 'reason', 'run_not_active');
	end if;

	select * into connection_row
	from public.group_accounting_bank_connections
	where id = run_row.connection_id
	for update;
	lease_owned := found and connection_row.sync_lease_id = p_run_id;

	if not lease_owned then
		update public.group_accounting_sync_runs
		set status = 'failed', completed_at = finished_at,
			error_code = 'sync_lease_lost',
			error_message = 'The sync lease expired before the provider run completed.'
		where id = p_run_id;
		return jsonb_build_object('recorded', false, 'reason', 'lease_lost');
	end if;

	update public.group_accounting_sync_runs
	set status = p_status,
		completed_at = finished_at,
		inserted_count = greatest(0, coalesce(p_inserted_count, 0)),
		updated_count = greatest(0, coalesce(p_updated_count, 0)),
		correction_count = greatest(0, coalesce(p_correction_count, 0)),
		skipped_count = greatest(0, coalesce(p_skipped_count, 0)),
		error_code = left(p_error_code, 80),
		error_message = left(p_error_message, 400)
	where id = p_run_id;

	failure_count := connection_row.sync_consecutive_failures;
	if p_status in ('failed', 'partial') then
		failure_count := failure_count + 1;
	elsif p_status = 'succeeded' then
		failure_count := 0;
	end if;

	update public.group_accounting_bank_connections
	set sync_status = p_status,
		last_sync_success_at = case when p_status = 'succeeded' then finished_at else last_sync_success_at end,
		last_synced_at = case when p_status = 'succeeded' then finished_at else last_synced_at end,
		sync_consecutive_failures = failure_count,
		next_sync_at = case
			when p_status = 'succeeded' then null
			when p_status = 'pending' then finished_at + interval '5 minutes'
			else finished_at + make_interval(secs => least(86400, 300 * power(2, least(greatest(failure_count - 1, 0), 8)))::integer)
		end,
		last_sync_error_code = case when p_status = 'succeeded' then null else left(p_error_code, 80) end,
		last_sync_error_message = case when p_status = 'succeeded' then null else left(p_error_message, 400) end,
		sync_lease_id = null,
		sync_lease_expires_at = null
	where id = connection_row.id;

	return jsonb_build_object('recorded', true, 'status', p_status, 'completed_at', finished_at);
end;
$$;

create or replace function public.sync_group_accounting_feed_items(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
	incoming record;
	existing public.group_accounting_bank_feed_items;
	new_id uuid;
	material_change boolean;
	account_change boolean;
	inserted_count integer := 0;
	updated_count integer := 0;
	correction_count integer := 0;
	skipped_count integer := 0;
	provider_facts jsonb;
	current_facts jsonb;
begin
	for incoming in
		select * from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as item (
			group_id uuid,
			connection_id uuid,
			provider text,
			source_transaction_id text,
			transaction_date date,
			account_id uuid,
			description text,
			amount_cents integer,
			currency text,
			provider_status text,
			should_import boolean,
			raw jsonb
		)
	loop
		if incoming.group_id is null or incoming.provider is null or incoming.source_transaction_id is null
			or incoming.transaction_date is null or incoming.description is null
			or incoming.amount_cents is null or incoming.currency is null then
			skipped_count := skipped_count + 1;
			continue;
		end if;

		if coalesce(incoming.should_import, true) then
			insert into public.group_accounting_bank_feed_items (
				group_id, connection_id, provider, source_transaction_id, transaction_date,
				account_id, description, amount_cents, currency, provider_status, status, raw
			)
			values (
				incoming.group_id, incoming.connection_id, incoming.provider,
				incoming.source_transaction_id, incoming.transaction_date, incoming.account_id,
				left(incoming.description, 200), incoming.amount_cents, lower(incoming.currency),
				incoming.provider_status, 'needs_review', coalesce(incoming.raw, '{}'::jsonb)
			)
			on conflict (group_id, provider, source_transaction_id) do nothing
			returning id into new_id;

			if new_id is not null then
				inserted_count := inserted_count + 1;
				new_id := null;
				continue;
			end if;
		end if;

		select * into existing
		from public.group_accounting_bank_feed_items
		where group_id = incoming.group_id
			and provider = incoming.provider
			and source_transaction_id = incoming.source_transaction_id
		for update;
		if not found then
			skipped_count := skipped_count + 1;
			continue;
		end if;

		material_change := existing.transaction_date is distinct from incoming.transaction_date
			or existing.description is distinct from left(incoming.description, 200)
			or existing.amount_cents is distinct from incoming.amount_cents
			or existing.currency is distinct from lower(incoming.currency)
			or existing.provider_status is distinct from incoming.provider_status;
		account_change := existing.account_id is null and incoming.account_id is not null;

		if existing.status = 'needs_review' and existing.matched_entry_id is null then
			if material_change or account_change then
				update public.group_accounting_bank_feed_items
				set connection_id = incoming.connection_id,
					account_id = coalesce(existing.account_id, incoming.account_id),
					transaction_date = incoming.transaction_date,
					description = left(incoming.description, 200),
					amount_cents = incoming.amount_cents,
					currency = lower(incoming.currency),
					provider_status = incoming.provider_status,
					raw = coalesce(incoming.raw, '{}'::jsonb)
				where id = existing.id and status = 'needs_review' and matched_entry_id is null;
				if found then updated_count := updated_count + 1; end if;
			else
				skipped_count := skipped_count + 1;
			end if;
		elsif existing.status = 'posted' or existing.matched_entry_id is not null then
			if material_change then
				current_facts := jsonb_build_object(
					'transaction_date', existing.transaction_date,
					'description', existing.description,
					'amount_cents', existing.amount_cents,
					'currency', existing.currency,
					'provider_status', existing.provider_status
				);
				provider_facts := jsonb_build_object(
					'transaction_date', incoming.transaction_date,
					'description', left(incoming.description, 200),
					'amount_cents', incoming.amount_cents,
					'currency', lower(incoming.currency),
					'provider_status', incoming.provider_status
				);
				if existing.provider_correction->'provider' = provider_facts and (existing.provider_correction_pending or existing.provider_correction_decision is not null) then
					skipped_count := skipped_count + 1;
					continue;
				end if;
				update public.group_accounting_bank_feed_items
				set provider_correction_pending = true,
					provider_correction = jsonb_build_object(
						'observed_at', now(),
						'current', current_facts,
						'provider', provider_facts
					),
					provider_correction_decision = null,
					provider_correction_resolved_at = null,
					provider_correction_resolved_by = null
				where id = existing.id;
				correction_count := correction_count + 1;
			else
				skipped_count := skipped_count + 1;
			end if;
		else
			skipped_count := skipped_count + 1;
		end if;
	end loop;

	return jsonb_build_object(
		'inserted', inserted_count,
		'updated', updated_count,
		'corrections', correction_count,
		'skipped', skipped_count
	);
end;
$$;

create or replace function public.resolve_group_accounting_provider_correction(
	p_group_id uuid,
	p_feed_item_id uuid,
	p_decision text,
	p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
	feed public.group_accounting_bank_feed_items;
begin
	if p_decision not in ('accepted', 'dismissed') then
		raise exception 'Invalid provider correction decision';
	end if;
	select * into feed
	from public.group_accounting_bank_feed_items
	where id = p_feed_item_id and group_id = p_group_id
	for update;
	if not found or feed.provider_correction_pending is not true then
		return jsonb_build_object('resolved', false);
	end if;
	update public.group_accounting_bank_feed_items
	set provider_correction_pending = false,
		provider_correction_decision = p_decision,
		provider_correction_resolved_at = now(),
		provider_correction_resolved_by = p_actor_user_id
	where id = feed.id;
	insert into public.group_accounting_audit_events(group_id,actor_user_id,event_type,entity_type,entity_id,before_json,after_json,metadata)
	values(p_group_id,p_actor_user_id,'provider_correction_reviewed','bank_feed_item',feed.id,to_jsonb(feed),jsonb_build_object('decision',p_decision,'provider_correction_pending',false),jsonb_build_object('note','Acknowledgement preserves posted books; use reversal and corrected entry if needed.'));
	return jsonb_build_object('resolved', true, 'decision', p_decision);
end;
$$;

revoke all on function public.claim_group_accounting_provider_sync(uuid, text, uuid, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.finish_group_accounting_provider_sync(uuid, text, integer, integer, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.sync_group_accounting_feed_items(jsonb) from public, anon, authenticated;
revoke all on function public.resolve_group_accounting_provider_correction(uuid, uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.claim_group_accounting_provider_sync(uuid, text, uuid, text, boolean, integer) to service_role;
grant execute on function public.finish_group_accounting_provider_sync(uuid, text, integer, integer, integer, integer, text, text) to service_role;
grant execute on function public.sync_group_accounting_feed_items(jsonb) to service_role;
grant execute on function public.resolve_group_accounting_provider_correction(uuid, uuid, text, uuid) to service_role;

-- Provider status changes must not let pending or corrected activity post through
-- another request between import and the application's validation.
create function public.guard_accounting_feed_provider_status() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.status in ('matched','posted') and (new.provider_correction_pending or new.provider_status in ('pending','void','cancelled','failed','reversed','blocked')) then
  raise exception 'Review the provider status or correction before posting this activity.';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_accounting_feed_provider_status() from public,anon,authenticated;
create trigger accounting_feed_provider_status_guard before update of status,matched_entry_id on public.group_accounting_bank_feed_items
for each row execute function public.guard_accounting_feed_provider_status();
