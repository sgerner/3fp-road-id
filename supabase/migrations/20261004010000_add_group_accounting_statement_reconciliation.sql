-- Persist imported bank statement evidence separately from the ledger. Draft
-- saves never clear activity; only the explicit close RPC may invoke the
-- existing guarded reconciliation workflow for a saved statement session.

alter table public.group_accounting_reconciliations
	add column if not exists period_start_date date,
	add column if not exists opening_balance_cents integer,
	add column if not exists statement_currency text,
	add column if not exists verification_mode text not null default 'legacy',
	add column if not exists verification_status text not null default 'legacy',
	add column if not exists statement_line_count integer not null default 0;

alter table public.group_accounting_reconciliations
	add constraint group_accounting_reconciliations_verification_mode_check
		check (verification_mode in ('legacy', 'statement', 'balance_only')),
	add constraint group_accounting_reconciliations_verification_status_check
		check (verification_status in ('legacy', 'pending', 'verified', 'qualified', 'unverified')),
	add constraint group_accounting_reconciliations_statement_line_count_check
		check (statement_line_count >= 0),
	add constraint group_accounting_reconciliations_period_check
		check (period_start_date is null or period_start_date <= statement_ending_date),
	add constraint group_accounting_reconciliations_statement_currency_check
		check (statement_currency is null or statement_currency ~ '^[A-Z]{3}$');

create table public.group_accounting_reconciliation_statement_lines (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	reconciliation_id uuid not null references public.group_accounting_reconciliations(id) on delete cascade,
	line_number integer not null check (line_number > 0),
	client_id text,
	transaction_date date,
	description text not null default '',
	amount_cents integer,
	currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
	running_balance_cents integer,
	page_number integer check (page_number is null or page_number > 0),
	resolution text not null default 'pending'
		check (resolution in ('pending', 'outstanding', 'matched', 'ignored', 'approved_exception')),
	reason text,
	raw jsonb not null default '{}'::jsonb,
	decided_by_user_id uuid references auth.users(id) on delete set null,
	decided_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (reconciliation_id, line_number)
);

create index group_accounting_reconciliation_statement_lines_client_idx
	on public.group_accounting_reconciliation_statement_lines (reconciliation_id, client_id)
	where client_id is not null;

create index group_accounting_reconciliation_statement_lines_group_date_idx
	on public.group_accounting_reconciliation_statement_lines (group_id, transaction_date, reconciliation_id);

create table public.group_accounting_reconciliation_line_matches (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	reconciliation_id uuid not null references public.group_accounting_reconciliations(id) on delete cascade,
	statement_line_id uuid not null references public.group_accounting_reconciliation_statement_lines(id) on delete cascade,
	feed_item_id uuid references public.group_accounting_bank_feed_items(id) on delete set null,
	entry_id uuid references public.group_accounting_entries(id) on delete set null,
	match_status text not null default 'suggested'
		check (match_status in ('suggested', 'confirmed', 'rejected')),
	is_split boolean not null default false,
	confidence numeric(5, 4) check (confidence is null or confidence between 0 and 1),
	reason text,
	created_by_user_id uuid references auth.users(id) on delete set null,
	decided_by_user_id uuid references auth.users(id) on delete set null,
	created_at timestamptz not null default timezone('utc', now()),
	decided_at timestamptz,
	constraint group_accounting_reconciliation_line_matches_evidence_check
		check (feed_item_id is not null or entry_id is not null),
	constraint group_accounting_reconciliation_line_matches_split_check
		check (not is_split or entry_id is not null)
);

create unique index group_accounting_reconciliation_line_matches_confirmed_line_unique
	on public.group_accounting_reconciliation_line_matches (reconciliation_id, statement_line_id)
	where match_status = 'confirmed';

create unique index group_accounting_reconciliation_line_matches_confirmed_feed_unique
	on public.group_accounting_reconciliation_line_matches (reconciliation_id, feed_item_id)
	where match_status = 'confirmed' and feed_item_id is not null and not is_split;

create unique index group_accounting_reconciliation_line_matches_confirmed_entry_unique
	on public.group_accounting_reconciliation_line_matches (reconciliation_id, entry_id)
	where match_status = 'confirmed' and entry_id is not null and not is_split;

create index group_accounting_reconciliation_line_matches_feed_idx
	on public.group_accounting_reconciliation_line_matches (group_id, feed_item_id)
	where feed_item_id is not null;

create index group_accounting_reconciliation_line_matches_entry_idx
	on public.group_accounting_reconciliation_line_matches (group_id, entry_id)
	where entry_id is not null;

-- Immutable decision history survives draft line replacement and records why
-- a statement row was matched, ignored, or approved as an exception.
create table public.group_accounting_reconciliation_line_decisions (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	reconciliation_id uuid not null references public.group_accounting_reconciliations(id) on delete cascade,
	statement_line_id uuid references public.group_accounting_reconciliation_statement_lines(id) on delete set null,
	line_number integer not null check (line_number > 0),
	resolution text not null
		check (resolution in ('pending', 'outstanding', 'matched', 'ignored', 'approved_exception')),
	reason text,
	before_json jsonb,
	after_json jsonb not null,
	actor_user_id uuid references auth.users(id) on delete set null,
	created_at timestamptz not null default timezone('utc', now())
);

create index group_accounting_reconciliation_line_decisions_reconciliation_idx
	on public.group_accounting_reconciliation_line_decisions (group_id, reconciliation_id, created_at desc);

create index group_accounting_reconciliation_line_decisions_line_idx
	on public.group_accounting_reconciliation_line_decisions (statement_line_id, created_at desc)
	where statement_line_id is not null;

alter table public.group_accounting_reconciliation_statement_lines enable row level security;
alter table public.group_accounting_reconciliation_line_matches enable row level security;
alter table public.group_accounting_reconciliation_line_decisions enable row level security;

create policy group_accounting_reconciliation_statement_lines_manager
	on public.group_accounting_reconciliation_statement_lines for all
	using (public.is_group_accounting_manager(group_id))
	with check (public.is_group_accounting_manager(group_id));

create policy group_accounting_reconciliation_line_matches_manager
	on public.group_accounting_reconciliation_line_matches for all
	using (public.is_group_accounting_manager(group_id))
	with check (public.is_group_accounting_manager(group_id));

create policy group_accounting_reconciliation_line_decisions_manager_select
	on public.group_accounting_reconciliation_line_decisions for select
	using (public.is_group_accounting_manager(group_id));

revoke all on table public.group_accounting_reconciliation_statement_lines,
	public.group_accounting_reconciliation_line_matches,
	public.group_accounting_reconciliation_line_decisions from public, anon, authenticated;
grant select, insert, update, delete on table public.group_accounting_reconciliation_statement_lines,
	public.group_accounting_reconciliation_line_matches,
	public.group_accounting_reconciliation_line_decisions to service_role;

drop trigger if exists group_accounting_reconciliation_statement_lines_group_reference
	on public.group_accounting_reconciliation_statement_lines;
create trigger group_accounting_reconciliation_statement_lines_group_reference
	before insert or update on public.group_accounting_reconciliation_statement_lines
	for each row execute function public.group_accounting_check_group_reference('reconciliation_id', 'group_accounting_reconciliations');

drop trigger if exists group_accounting_reconciliation_line_matches_group_reference
	on public.group_accounting_reconciliation_line_matches;
create trigger group_accounting_reconciliation_line_matches_group_reference
	before insert or update on public.group_accounting_reconciliation_line_matches
	for each row execute function public.group_accounting_check_group_reference(
		'reconciliation_id', 'group_accounting_reconciliations',
		'statement_line_id', 'group_accounting_reconciliation_statement_lines',
		'feed_item_id', 'group_accounting_bank_feed_items',
		'entry_id', 'group_accounting_entries'
	);

create or replace function public.group_accounting_check_reconciliation_line_match()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
	line_reconciliation_id uuid;
	reconciliation_account_id uuid;
	feed_account_id uuid;
	feed_entry_id uuid;
begin
	select reconciliation_id into line_reconciliation_id
	from public.group_accounting_reconciliation_statement_lines
	where id = new.statement_line_id and group_id = new.group_id;
	if line_reconciliation_id is distinct from new.reconciliation_id then
		raise exception 'A statement match must belong to the same reconciliation as its line.';
	end if;
	select account_id into reconciliation_account_id
	from public.group_accounting_reconciliations
	where id = new.reconciliation_id and group_id = new.group_id;
	if not found then raise exception 'Statement match reconciliation not found.'; end if;
	if new.feed_item_id is not null then
		select account_id, matched_entry_id into feed_account_id, feed_entry_id
		from public.group_accounting_bank_feed_items
		where id = new.feed_item_id and group_id = new.group_id;
		if not found or feed_account_id is distinct from reconciliation_account_id then
			raise exception 'A statement feed match must belong to the reconciliation account.';
		end if;
		if feed_entry_id is not null and new.entry_id is not null and feed_entry_id is distinct from new.entry_id then
			raise exception 'A bank-feed match must use the feed item’s matched ledger entry.';
		end if;
	end if;
	if new.entry_id is not null and not exists (
		select 1 from public.group_accounting_entries entry
		join public.group_accounting_lines ledger_line on ledger_line.entry_id = entry.id
		where entry.id = new.entry_id and entry.group_id = new.group_id
			and ledger_line.account_id = reconciliation_account_id
	) then raise exception 'A statement ledger match must contain activity for the reconciliation account.'; end if;
	return new;
end;
$$;

drop trigger if exists group_accounting_reconciliation_line_matches_check_reference
	on public.group_accounting_reconciliation_line_matches;
create trigger group_accounting_reconciliation_line_matches_check_reference
	before insert or update on public.group_accounting_reconciliation_line_matches
	for each row execute function public.group_accounting_check_reconciliation_line_match();

drop trigger if exists group_accounting_reconciliation_line_decisions_group_reference
	on public.group_accounting_reconciliation_line_decisions;
create trigger group_accounting_reconciliation_line_decisions_group_reference
	before insert or update on public.group_accounting_reconciliation_line_decisions
	for each row execute function public.group_accounting_check_group_reference(
		'reconciliation_id', 'group_accounting_reconciliations',
		'statement_line_id', 'group_accounting_reconciliation_statement_lines'
	);

create or replace function public.group_accounting_check_reconciliation_line_decision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
	line_reconciliation_id uuid;
begin
	if new.statement_line_id is not null then
		select reconciliation_id into line_reconciliation_id
		from public.group_accounting_reconciliation_statement_lines
		where id = new.statement_line_id and group_id = new.group_id;
		if line_reconciliation_id is distinct from new.reconciliation_id then
			raise exception 'A statement decision must belong to the same reconciliation as its line.';
		end if;
	end if;
	return new;
end;
$$;

drop trigger if exists group_accounting_reconciliation_line_decisions_check_reference
	on public.group_accounting_reconciliation_line_decisions;
create trigger group_accounting_reconciliation_line_decisions_check_reference
	before insert or update on public.group_accounting_reconciliation_line_decisions
	for each row execute function public.group_accounting_check_reconciliation_line_decision();

create or replace function public.group_accounting_guard_statement_reconciliation_completion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
	allow_reconciliation text := current_setting('app.group_accounting_statement_close', true);
begin
	if tg_op = 'UPDATE' then
		if old.verification_mode = 'statement' and new.verification_mode <> 'statement' then
			raise exception 'Statement verification mode cannot be downgraded.';
		end if;
		if old.verification_mode = 'balance_only' and new.verification_mode = 'legacy' then
			raise exception 'Balance-only verification mode cannot be downgraded.';
		end if;
	end if;

	if new.verification_mode in ('statement', 'balance_only') and new.status = 'completed'
		and (tg_op = 'INSERT' or old.status is distinct from 'completed')
		and allow_reconciliation is distinct from new.id::text then
		raise exception 'Use the explicit reconciliation close workflow for saved statement sessions.';
	end if;
	return new;
end;
$$;

drop trigger if exists group_accounting_guard_statement_reconciliation_completion
	on public.group_accounting_reconciliations;
create trigger group_accounting_guard_statement_reconciliation_completion
	before insert or update on public.group_accounting_reconciliations
	for each row execute function public.group_accounting_guard_statement_reconciliation_completion();

create or replace function public.group_accounting_guard_statement_line_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
	reconciliation_status text;
	reconciliation_id uuid;
	row_group_id uuid;
begin
	if tg_op = 'DELETE' then
		reconciliation_id := old.reconciliation_id;
		row_group_id := old.group_id;
	else
		reconciliation_id := new.reconciliation_id;
		row_group_id := new.group_id;
	end if;
	select status into reconciliation_status
	from public.group_accounting_reconciliations
	where id = reconciliation_id and group_id = row_group_id;
	if reconciliation_status is distinct from 'draft' then
		raise exception 'Statement evidence can only be edited while its reconciliation is a draft.';
	end if;
	if tg_op = 'DELETE' then return old; end if;
	return new;
end;
$$;

drop trigger if exists group_accounting_guard_statement_line_mutation
	on public.group_accounting_reconciliation_statement_lines;
create trigger group_accounting_guard_statement_line_mutation
	before insert or update or delete on public.group_accounting_reconciliation_statement_lines
	for each row execute function public.group_accounting_guard_statement_line_mutation();

drop trigger if exists group_accounting_guard_statement_match_mutation
	on public.group_accounting_reconciliation_line_matches;
create trigger group_accounting_guard_statement_match_mutation
	before insert or update or delete on public.group_accounting_reconciliation_line_matches
	for each row execute function public.group_accounting_guard_statement_line_mutation();

create or replace function public.group_accounting_guard_statement_line_decision_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
	if pg_trigger_depth() <= 1 then raise exception 'Statement-line decisions are immutable.'; end if;
	if tg_op = 'DELETE' then return old; end if;
	return new;
end;
$$;

drop trigger if exists group_accounting_statement_line_decisions_immutable
	on public.group_accounting_reconciliation_line_decisions;
create trigger group_accounting_statement_line_decisions_immutable
	before update or delete on public.group_accounting_reconciliation_line_decisions
	for each row execute function public.group_accounting_guard_statement_line_decision_history();

create or replace function public.group_accounting_set_statement_line_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
	new.updated_at := timezone('utc', now());
	return new;
end;
$$;

drop trigger if exists group_accounting_statement_lines_set_updated_at
	on public.group_accounting_reconciliation_statement_lines;
create trigger group_accounting_statement_lines_set_updated_at
	before update on public.group_accounting_reconciliation_statement_lines
	for each row execute function public.group_accounting_set_statement_line_updated_at();

create or replace function public.group_accounting_save_reconciliation_draft(
	p_group_id uuid,
	p_account_id uuid,
	p_reconciliation_id uuid,
	p_period_start_date date,
	p_statement_date date,
	p_opening_balance_cents integer,
	p_statement_balance_cents integer,
	p_statement_file jsonb,
	p_statement_currency text,
	p_statement_lines jsonb,
	p_actor_id uuid,
	p_selected_feed_item_ids uuid[] default '{}'::uuid[],
	p_selected_ledger_entry_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
	account public.group_accounting_accounts;
	reconciliation public.group_accounting_reconciliations;
	existing_line public.group_accounting_reconciliation_statement_lines;
	saved_line public.group_accounting_reconciliation_statement_lines;
	line_payload jsonb;
	saved_match public.group_accounting_reconciliation_line_matches;
	line_date date;
	line_amount integer;
	line_balance integer;
	line_resolution text;
	current_line_number integer := 0;
	line_count integer;
	line_total bigint := 0;
	client_id text;
	line_description text;
	decision_reason text;
	page_number integer;
	v_feed_id uuid;
	v_entry_id uuid;
	v_feed_entry_id uuid;
	mode text;
	v_group_currency text;
	v_statement_currency text;
	v_line_currency text;
	v_selected_feed_ids uuid[];
	v_selected_entry_ids uuid[];
	file_path text;
	file_name text;
	file_mime text;
	file_size bigint;
	before_reconciliation jsonb;
	input_lines jsonb;
	previous_matches jsonb;
	previous_match jsonb;
	current_match jsonb;
begin
	if p_group_id is null or p_account_id is null or p_statement_date is null or p_statement_balance_cents is null then
		raise exception 'Enter an account, statement date, and ending balance.';
	end if;
	if jsonb_typeof(coalesce(p_statement_lines, '[]'::jsonb)) <> 'array' then
		raise exception 'Statement lines must be an array.';
	end if;
	input_lines := coalesce(p_statement_lines, '[]'::jsonb);
	line_count := jsonb_array_length(input_lines);
	if line_count > 10000 then raise exception 'A statement can contain at most 10,000 lines.'; end if;
	mode := case when line_count > 0 then 'statement' else 'balance_only' end;
	if p_period_start_date is not null and p_period_start_date > p_statement_date then
		raise exception 'The statement period start must be on or before its ending date.';
	end if;

	perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
	select * into account from public.group_accounting_accounts
	where id = p_account_id and group_id = p_group_id for update;
	if not found or account.kind not in ('asset', 'liability') then
		raise exception 'Choose a bank or credit card account.';
	end if;
	select coalesce(array_agg(distinct id), '{}'::uuid[]) into v_selected_feed_ids
	from unnest(coalesce(p_selected_feed_item_ids, '{}'::uuid[])) selected(id) where id is not null;
	select coalesce(array_agg(distinct id), '{}'::uuid[]) into v_selected_entry_ids
	from unnest(coalesce(p_selected_ledger_entry_ids, '{}'::uuid[])) selected(id) where id is not null;
	if exists (
		select 1 from unnest(v_selected_feed_ids) selected(id)
		where not exists (
			select 1 from public.group_accounting_bank_feed_items feed
			where feed.id = selected.id and feed.group_id = p_group_id and feed.account_id = p_account_id
		)
	) then raise exception 'Selected bank activity must belong to this account and group.'; end if;
	if exists (
		select 1 from unnest(v_selected_entry_ids) selected(id)
		where not exists (
			select 1 from public.group_accounting_entries entry
			join public.group_accounting_lines line on line.entry_id = entry.id
			where entry.id = selected.id and entry.group_id = p_group_id and line.account_id = p_account_id
		)
	) then raise exception 'Selected ledger activity must belong to this account and group.'; end if;
	select coalesce(currency, 'usd') into v_group_currency
	from public.group_accounting_settings where group_id = p_group_id;
	v_group_currency := upper(coalesce(v_group_currency, 'usd'));
	v_statement_currency := upper(nullif(btrim(coalesce(p_statement_currency, '')), ''));
	if mode = 'statement' and v_statement_currency is null then
		raise exception 'Statement currency is required when statement lines are supplied.';
	end if;
	if v_statement_currency is null then v_statement_currency := v_group_currency; end if;
	if v_statement_currency !~ '^[A-Z]{3}$' then raise exception 'Enter a valid three-letter statement currency.'; end if;
	if v_statement_currency <> v_group_currency then raise exception 'Statement currency must match the group accounting currency.'; end if;

	if p_statement_file is not null then
		file_path := nullif(p_statement_file->>'object_path', '');
		file_name := nullif(p_statement_file->>'file_name', '');
		file_mime := nullif(p_statement_file->>'mime_type', '');
		file_size := nullif(p_statement_file->>'size_bytes', '')::bigint;
		if coalesce(file_path, '') not like p_group_id::text || '/reconciliations/%'
			or coalesce(file_name, '') = ''
			or coalesce(file_mime, '') not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/csv')
			or coalesce(file_size, 0) <= 0 or file_size > 10485760 then
			raise exception 'Choose a valid statement attachment.';
		end if;
	end if;

	-- Validate supplied values and dates before changing the draft. Arithmetic
	-- and incomplete extraction checks are intentionally deferred until close.
	for line_payload in select value from jsonb_array_elements(input_lines) as lines(value) loop
		current_line_number := current_line_number + 1;
		begin
			line_date := nullif(coalesce(line_payload->>'transactionDate', line_payload->>'transaction_date'), '')::date;
			line_amount := nullif(coalesce(line_payload->>'amountCents', line_payload->>'amount_cents'), '')::integer;
			line_balance := nullif(coalesce(line_payload->>'runningBalanceCents', line_payload->>'running_balance_cents'), '')::integer;
			page_number := nullif(coalesce(line_payload->>'pageNumber', line_payload->>'page_number'), '')::integer;
		exception when others then
			raise exception 'Statement line % contains an invalid date, amount, balance, or page number.', current_line_number;
		end;
		if line_date is not null and p_period_start_date is not null and (line_date < p_period_start_date or line_date > p_statement_date) then
			raise exception 'Statement line % is outside the statement period.', current_line_number;
		end if;
		if page_number is not null and page_number < 1 then raise exception 'Statement page numbers must be positive.'; end if;
		line_resolution := lower(coalesce(nullif(line_payload->>'resolution', ''), 'pending'));
		if line_resolution not in ('pending', 'outstanding', 'matched', 'ignored', 'approved_exception') then
			raise exception 'Statement line % has an unsupported resolution.', current_line_number;
		end if;
		if line_resolution <> 'ignored' and line_amount is not null then line_total := line_total + line_amount::bigint; end if;
	end loop;
	if exists (
		select 1 from (
			select nullif(coalesce(value->>'clientId', value->>'client_id'), '') as client_key
			from jsonb_array_elements(input_lines) as rows(value)
		) keys where client_key is not null group by client_key having count(*) > 1
	) then raise exception 'Statement line client IDs must be unique.'; end if;

	if p_reconciliation_id is not null then
		select * into reconciliation from public.group_accounting_reconciliations
		where id = p_reconciliation_id and group_id = p_group_id and account_id = p_account_id
		for update;
		if not found then raise exception 'Reconciliation draft not found for this account.'; end if;
		if reconciliation.status <> 'draft' then raise exception 'Reopen this reconciliation before editing its statement.'; end if;
		if reconciliation.verification_mode = 'statement' and mode <> 'statement' then
			raise exception 'A statement with imported lines cannot be downgraded to balance-only.';
		end if;
		if reconciliation.statement_ending_date <> p_statement_date then
			raise exception 'The statement ending date cannot change after a draft is created.';
		end if;
	else
		select * into reconciliation from public.group_accounting_reconciliations
		where group_id = p_group_id and account_id = p_account_id
			and statement_ending_date = p_statement_date and status = 'draft'
		order by created_at desc limit 1 for update;
		if found and reconciliation.verification_mode = 'statement' and mode <> 'statement' then
			raise exception 'A statement with imported lines cannot be downgraded to balance-only.';
		end if;
	end if;
	if reconciliation.id is not null then before_reconciliation := to_jsonb(reconciliation); end if;
	if reconciliation.id is null and exists (
		select 1 from public.group_accounting_reconciliations completed
		where completed.group_id = p_group_id and completed.account_id = p_account_id
			and completed.statement_ending_date = p_statement_date and completed.status = 'completed'
	) then raise exception 'This statement is already reconciled. Reopen it before creating another draft.'; end if;

	if reconciliation.id is null then
		insert into public.group_accounting_reconciliations (
			group_id, account_id, statement_ending_date, statement_ending_balance_cents,
			period_start_date, opening_balance_cents, verification_mode, verification_status,
			statement_currency, statement_line_count, statement_object_path, statement_file_name, statement_mime_type, statement_size_bytes,
			checked_feed_item_ids, cleared_entry_ids
		) values (
			p_group_id, p_account_id, p_statement_date, p_statement_balance_cents,
			p_period_start_date, p_opening_balance_cents, mode, 'pending', v_statement_currency, line_count,
			file_path, file_name, file_mime, file_size, v_selected_feed_ids, v_selected_entry_ids
		) returning * into reconciliation;
	else
		update public.group_accounting_reconciliations set
			statement_ending_balance_cents = p_statement_balance_cents,
			period_start_date = p_period_start_date,
			opening_balance_cents = p_opening_balance_cents,
			statement_currency = v_statement_currency,
			verification_mode = mode,
			verification_status = 'pending',
			statement_line_count = line_count,
			checked_feed_item_ids = v_selected_feed_ids,
			cleared_entry_ids = v_selected_entry_ids,
			statement_object_path = case when p_statement_file is not null then file_path else statement_object_path end,
			statement_file_name = case when p_statement_file is not null then file_name else statement_file_name end,
			statement_mime_type = case when p_statement_file is not null then file_mime else statement_mime_type end,
			statement_size_bytes = case when p_statement_file is not null then file_size else statement_size_bytes end
		where id = reconciliation.id returning * into reconciliation;
	end if;

	select coalesce(jsonb_object_agg(line.line_number::text, jsonb_build_object(
		'feed_item_id', match.feed_item_id,
		'entry_id', match.entry_id,
		'match_status', match.match_status,
		'is_split', match.is_split,
		'confidence', match.confidence,
		'reason', match.reason
	)), '{}'::jsonb)
	into previous_matches
	from public.group_accounting_reconciliation_line_matches match
	join public.group_accounting_reconciliation_statement_lines line on line.id = match.statement_line_id
	where match.reconciliation_id = reconciliation.id;
	delete from public.group_accounting_reconciliation_line_matches where reconciliation_id = reconciliation.id;
	current_line_number := 0;
	for line_payload in select value from jsonb_array_elements(input_lines) as lines(value) loop
		current_line_number := current_line_number + 1;
		client_id := nullif(coalesce(line_payload->>'clientId', line_payload->>'client_id'), '');
		line_date := nullif(coalesce(line_payload->>'transactionDate', line_payload->>'transaction_date'), '')::date;
		line_amount := nullif(coalesce(line_payload->>'amountCents', line_payload->>'amount_cents'), '')::integer;
		v_line_currency := upper(coalesce(nullif(btrim(line_payload->>'currency'), ''), v_statement_currency));
		if v_line_currency !~ '^[A-Z]{3}$' then raise exception 'Enter a valid currency on each statement line.'; end if;
		if v_line_currency <> v_statement_currency then raise exception 'Every statement line currency must match the statement and group currency.'; end if;
		line_balance := nullif(coalesce(line_payload->>'runningBalanceCents', line_payload->>'running_balance_cents'), '')::integer;
		page_number := nullif(coalesce(line_payload->>'pageNumber', line_payload->>'page_number'), '')::integer;
		line_description := coalesce(line_payload->>'description', '');
		decision_reason := nullif(btrim(coalesce(line_payload->>'reason', '')), '');
		line_resolution := lower(coalesce(nullif(line_payload->>'resolution', ''), 'pending'));
		if line_resolution not in ('pending', 'outstanding', 'matched', 'ignored', 'approved_exception') then
			raise exception 'Statement line % has an unsupported resolution.', current_line_number;
		end if;
		if line_resolution in ('ignored', 'approved_exception') and decision_reason is null then
			raise exception 'Add a reason for ignoring or approving statement line % as an exception.', current_line_number;
		end if;
		v_feed_id := nullif(coalesce(line_payload->>'feedItemId', line_payload->>'feed_item_id'), '')::uuid;
		v_entry_id := nullif(coalesce(line_payload->>'entryId', line_payload->>'entry_id'), '')::uuid;
		if v_feed_id is not null then
			select matched_entry_id into v_feed_entry_id from public.group_accounting_bank_feed_items
			where id = v_feed_id and group_id = p_group_id and account_id = p_account_id;
			if not found then raise exception 'Statement line % references bank activity from another group or account.', current_line_number; end if;
			if v_entry_id is null then v_entry_id := v_feed_entry_id; end if;
			if v_feed_entry_id is not null and v_entry_id is distinct from v_feed_entry_id then
				raise exception 'Statement line % pairs a bank-feed row with a different ledger entry.', current_line_number;
			end if;
		end if;
		if v_entry_id is not null and not exists (
			select 1 from public.group_accounting_entries e
			join public.group_accounting_lines l on l.entry_id = e.id and l.account_id = p_account_id
			where e.id = v_entry_id and e.group_id = p_group_id
		) then raise exception 'Statement line % references a ledger entry outside this account.', current_line_number; end if;
		if line_resolution = 'matched' and v_feed_id is null and v_entry_id is null then
			raise exception 'Matched statement line % needs a bank-feed item or ledger entry.', current_line_number;
		end if;
		if line_resolution in ('ignored', 'approved_exception') and (v_feed_id is not null or v_entry_id is not null) then
			raise exception 'Remove selected match evidence before resolving statement line % as an exception.', current_line_number;
		end if;

		select statement_line.* into existing_line from public.group_accounting_reconciliation_statement_lines statement_line
		where statement_line.reconciliation_id = reconciliation.id
			and statement_line.line_number = current_line_number for update;
		previous_match := previous_matches -> current_line_number::text;
		current_match := null;
		insert into public.group_accounting_reconciliation_statement_lines (
			group_id, reconciliation_id, line_number, client_id, transaction_date, description,
			amount_cents, currency, running_balance_cents, page_number, resolution, reason, raw,
			decided_by_user_id, decided_at
		) values (
			p_group_id, reconciliation.id, current_line_number, client_id, line_date, line_description,
			line_amount, v_line_currency, line_balance, page_number, line_resolution, decision_reason,
			coalesce(line_payload->'raw', '{}'::jsonb),
			case when line_resolution in ('matched', 'ignored', 'approved_exception') then p_actor_id else null end,
			case when line_resolution in ('matched', 'ignored', 'approved_exception') then now() else null end
		) on conflict (reconciliation_id, line_number) do update set
			client_id = excluded.client_id,
			transaction_date = excluded.transaction_date,
			description = excluded.description,
			amount_cents = excluded.amount_cents,
			currency = excluded.currency,
			running_balance_cents = excluded.running_balance_cents,
			page_number = excluded.page_number,
			resolution = excluded.resolution,
			reason = excluded.reason,
			raw = excluded.raw,
			decided_by_user_id = excluded.decided_by_user_id,
			decided_at = excluded.decided_at
		returning * into saved_line;

		if v_feed_id is not null or v_entry_id is not null then
			insert into public.group_accounting_reconciliation_line_matches (
				group_id, reconciliation_id, statement_line_id, feed_item_id, entry_id,
				match_status, is_split, confidence, reason, created_by_user_id, decided_by_user_id, decided_at
			) values (
				p_group_id, reconciliation.id, saved_line.id, v_feed_id, v_entry_id,
				case when line_resolution = 'matched' then 'confirmed'
					when line_resolution in ('ignored', 'approved_exception') then 'rejected' else 'suggested' end,
				coalesce((line_payload->>'isSplit')::boolean, false),
				nullif(coalesce(line_payload->>'confidence', ''), '')::numeric,
				coalesce(nullif(line_payload->>'matchReason', ''), nullif(line_payload->>'match_reason', ''),
					case when line_resolution = 'matched' and v_entry_id is not null and v_feed_id is null
						then 'No bank-feed item was linked; this line was matched to the ledger entry directly.' end),
				p_actor_id,
				case when line_resolution = 'matched' then p_actor_id else null end,
				case when line_resolution = 'matched' then now() else null end
			) returning * into saved_match;
			current_match := jsonb_build_object(
				'feed_item_id', saved_match.feed_item_id,
				'entry_id', saved_match.entry_id,
				'match_status', saved_match.match_status,
				'is_split', saved_match.is_split,
				'confidence', saved_match.confidence,
				'reason', saved_match.reason
			);
		else
			saved_match := null;
		end if;
		if existing_line.resolution is distinct from line_resolution
			or existing_line.reason is distinct from decision_reason
			or existing_line.client_id is distinct from client_id
			or existing_line.transaction_date is distinct from line_date
			or existing_line.description is distinct from line_description
			or existing_line.amount_cents is distinct from line_amount
			or existing_line.currency is distinct from v_line_currency
			or existing_line.running_balance_cents is distinct from line_balance
			or existing_line.page_number is distinct from page_number
			or existing_line.raw is distinct from coalesce(line_payload->'raw', '{}'::jsonb)
			or existing_line.id is null
			or previous_match is distinct from current_match then
			insert into public.group_accounting_reconciliation_line_decisions (
				group_id, reconciliation_id, statement_line_id, line_number, resolution, reason,
				before_json, after_json, actor_user_id
			) values (
				p_group_id, reconciliation.id, saved_line.id, current_line_number, line_resolution, decision_reason,
				case when existing_line.id is null then null else to_jsonb(existing_line) || jsonb_build_object('matches', previous_match) end,
				to_jsonb(saved_line) || jsonb_build_object('matches', current_match), p_actor_id
			);
		end if;
	end loop;
	insert into public.group_accounting_reconciliation_line_decisions (
		group_id, reconciliation_id, statement_line_id, line_number, resolution, reason,
		before_json, after_json, actor_user_id
	)
	select p_group_id, reconciliation.id, line.id, line.line_number, line.resolution, line.reason,
		to_jsonb(line) || jsonb_build_object('matches', previous_matches -> line.line_number::text),
		jsonb_build_object('deleted', true, 'line_number', line.line_number), p_actor_id
	from public.group_accounting_reconciliation_statement_lines line
	where line.reconciliation_id = reconciliation.id and line.line_number > line_count;
	delete from public.group_accounting_reconciliation_statement_lines
	where reconciliation_id = reconciliation.id and line_number > line_count;

	insert into public.group_accounting_audit_events (
		group_id, actor_user_id, event_type, entity_type, entity_id, before_json, after_json, metadata
	) values (
		p_group_id, p_actor_id, 'save_reconciliation_statement', 'reconciliation', reconciliation.id,
		before_reconciliation, to_jsonb(reconciliation),
		jsonb_build_object('verification_mode', mode, 'statement_line_count', line_count)
	);

	return to_jsonb(reconciliation) || jsonb_build_object(
		'statement_line_count', line_count,
		'statement_balance_delta_cents', case when p_opening_balance_cents is null then null
			else p_statement_balance_cents::bigint - (p_opening_balance_cents::bigint + line_total) end,
		'verification_mode', mode,
		'statement_lines', coalesce((
			select jsonb_agg(to_jsonb(line) || jsonb_build_object('matches', coalesce(matches.rows, '[]'::jsonb)) order by line.line_number)
			from public.group_accounting_reconciliation_statement_lines line
			left join lateral (
				select jsonb_agg(to_jsonb(match) order by match.created_at) as rows
				from public.group_accounting_reconciliation_line_matches match
				where match.statement_line_id = line.id
			) matches on true
			where line.reconciliation_id = reconciliation.id
		), '[]'::jsonb)
	);
end;
$$;

revoke all on function public.group_accounting_save_reconciliation_draft(uuid, uuid, uuid, date, date, integer, integer, jsonb, text, jsonb, uuid, uuid[], uuid[])
	from public, anon, authenticated;
grant execute on function public.group_accounting_save_reconciliation_draft(uuid, uuid, uuid, date, date, integer, integer, jsonb, text, jsonb, uuid, uuid[], uuid[])
	to service_role;

create or replace function public.group_accounting_close_reconciliation(
	p_group_id uuid,
	p_reconciliation_id uuid,
	p_selected_feed_item_ids uuid[],
	p_selected_ledger_entry_ids uuid[],
	p_actor_id uuid
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
	reconciliation public.group_accounting_reconciliations;
	account public.group_accounting_accounts;
	active_draft_count integer;
	result jsonb;
	feed_ids uuid[];
	entry_ids uuid[];
	expected_feed_ids uuid[];
	expected_entry_ids uuid[];
	line_count integer;
	line_total bigint;
	previous public.group_accounting_reconciliations;
	statement_file jsonb;
	v_verification_status text;
	group_currency text;
begin
	if p_group_id is null or p_reconciliation_id is null then raise exception 'Choose a reconciliation to close.'; end if;
	perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
	select * into reconciliation from public.group_accounting_reconciliations
	where id = p_reconciliation_id and group_id = p_group_id for update;
	if not found then raise exception 'Reconciliation draft not found.'; end if;
	if reconciliation.status <> 'draft' then raise exception 'Only draft reconciliations can be closed.'; end if;
	if reconciliation.verification_mode not in ('statement', 'balance_only') then
		raise exception 'Save this reconciliation through the explicit statement workflow before closing it.';
	end if;
	if exists (
		select 1 from public.group_accounting_reconciliations completed
		where completed.group_id = p_group_id and completed.account_id = reconciliation.account_id
			and completed.statement_ending_date = reconciliation.statement_ending_date
			and completed.status = 'completed' and completed.id <> reconciliation.id
	) then raise exception 'This statement is already reconciled. Reopen it before closing another draft.'; end if;
	select * into account from public.group_accounting_accounts
	where id = reconciliation.account_id and group_id = p_group_id;
	if not found or account.kind not in ('asset', 'liability') then raise exception 'Choose a bank or credit card account.'; end if;
	select coalesce(currency, 'usd') into group_currency from public.group_accounting_settings where group_id = p_group_id;
	group_currency := coalesce(group_currency, 'usd');
	if reconciliation.statement_currency is null
		or upper(reconciliation.statement_currency) <> upper(group_currency) then
		raise exception 'The saved statement currency must match the group accounting currency.';
	end if;
	feed_ids := coalesce(p_selected_feed_item_ids, '{}'::uuid[]);
	entry_ids := coalesce(p_selected_ledger_entry_ids, '{}'::uuid[]);
	select coalesce(array_agg(distinct selected_id), '{}'::uuid[]) into feed_ids
	from unnest(feed_ids) as selected(selected_id) where selected_id is not null;
	select coalesce(array_agg(distinct selected_id), '{}'::uuid[]) into entry_ids
	from unnest(entry_ids) as selected(selected_id) where selected_id is not null;

	if reconciliation.verification_mode = 'statement' then
		if reconciliation.period_start_date is null or reconciliation.opening_balance_cents is null then
			raise exception 'Statement period metadata is incomplete.';
		end if;
		select count(*), coalesce(sum(amount_cents::bigint) filter (where resolution <> 'ignored'), 0)
		into line_count, line_total
		from public.group_accounting_reconciliation_statement_lines
		where group_id = p_group_id and reconciliation_id = reconciliation.id;
		if line_count = 0 or line_count <> reconciliation.statement_line_count then
			raise exception 'Statement-line coverage is incomplete.';
		end if;
		if exists (
			select 1 from public.group_accounting_reconciliation_statement_lines line
			where line.reconciliation_id = reconciliation.id
				and ((line.resolution <> 'ignored' and (line.transaction_date is null or line.amount_cents is null))
					or (line.resolution <> 'ignored' and upper(coalesce(line.currency, '')) <> upper(reconciliation.statement_currency))
					or (line.resolution <> 'ignored' and nullif(btrim(coalesce(line.description, '')), '') is null)
					or (line.resolution <> 'ignored' and line.transaction_date < reconciliation.period_start_date)
					or (line.resolution <> 'ignored' and line.transaction_date > reconciliation.statement_ending_date)
					or line.resolution in ('pending', 'outstanding'))
		) then raise exception 'Every non-ignored statement line needs a description, date, amount, and resolved decision.'; end if;
		if reconciliation.opening_balance_cents::bigint + line_total <> reconciliation.statement_ending_balance_cents::bigint then
			raise exception 'Opening balance plus statement activity must equal the ending balance.';
		end if;
		if exists (
			select 1 from (
				select line.resolution, line.running_balance_cents,
					reconciliation.opening_balance_cents::bigint + sum(
						case when line.resolution = 'ignored' then 0 else line.amount_cents::bigint end
					) over (order by line.line_number) as expected_balance
				from public.group_accounting_reconciliation_statement_lines line
				where line.reconciliation_id = reconciliation.id
			) statement_balances
			where resolution <> 'ignored' and running_balance_cents is not null and running_balance_cents::bigint <> expected_balance
		) then raise exception 'A statement running balance does not match its opening balance and prior activity.'; end if;
		if exists (
			select 1 from public.group_accounting_reconciliation_statement_lines line
			where line.reconciliation_id = reconciliation.id
				and line.resolution in ('ignored', 'approved_exception')
				and nullif(btrim(coalesce(line.reason, '')), '') is null
		) then raise exception 'Every ignored statement line needs an explanation.'; end if;
		if exists (
			select 1 from public.group_accounting_reconciliation_statement_lines line
			where line.reconciliation_id = reconciliation.id and line.resolution = 'matched'
				and not exists (
					select 1 from public.group_accounting_reconciliation_line_matches match
					where match.statement_line_id = line.id and match.match_status = 'confirmed'
				)
		) then raise exception 'Match every resolved statement line to bank activity or a ledger entry.'; end if;
		if exists (
			select 1 from public.group_accounting_reconciliation_line_matches match
			join public.group_accounting_reconciliation_statement_lines line on line.id = match.statement_line_id
			left join public.group_accounting_entries entry on entry.id = match.entry_id
			left join public.group_accounting_bank_feed_items feed on feed.id = match.feed_item_id
			where match.reconciliation_id = reconciliation.id and match.match_status = 'confirmed'
				and (line.resolution <> 'matched'
					or (match.entry_id is not null and (entry.id is null or entry.group_id <> p_group_id
						or entry.status not in ('posted', 'void')
						or upper(entry.currency) <> upper(group_currency)
						or entry.entry_date > reconciliation.statement_ending_date
						or not exists (
							select 1 from public.group_accounting_lines ledger_line
							where ledger_line.entry_id = entry.id and ledger_line.group_id = p_group_id
								and ledger_line.account_id = reconciliation.account_id
						)))
					or (match.feed_item_id is not null and (feed.id is null or feed.group_id <> p_group_id
						or feed.account_id is distinct from reconciliation.account_id
						or feed.transaction_date < reconciliation.period_start_date - 14
						or feed.transaction_date > reconciliation.statement_ending_date
						or feed.status not in ('matched', 'posted') or feed.cleared_at is not null
						or feed.provider_correction_pending
						or upper(feed.currency) <> upper(group_currency)
						or abs(feed.transaction_date - line.transaction_date) > 14
						or feed.matched_entry_id is null
						or feed.matched_entry_id is distinct from match.entry_id
					)))
		) then raise exception 'Confirmed statement matches must point to posted, uncleared activity for this account and period.'; end if;
		if exists (
			select match.entry_id
			from public.group_accounting_reconciliation_line_matches match
			join public.group_accounting_reconciliation_statement_lines line on line.id = match.statement_line_id
			join public.group_accounting_entries entry on entry.id = match.entry_id
			join public.group_accounting_accounts matched_account on matched_account.id = reconciliation.account_id
			join lateral (
				select coalesce(sum(case when matched_account.normal_side = 'credit'
					then ledger_line.credit_cents::bigint - ledger_line.debit_cents
					else ledger_line.debit_cents::bigint - ledger_line.credit_cents end), 0) as effect
				from public.group_accounting_lines ledger_line
				where ledger_line.entry_id = entry.id and ledger_line.account_id = reconciliation.account_id
			) amount on true
			where match.reconciliation_id = reconciliation.id and match.match_status = 'confirmed'
			group by match.entry_id, amount.effect
			having (count(*) > 1 and not bool_and(match.is_split))
				or sum(line.amount_cents::bigint) <> amount.effect
		) then raise exception 'Ledger matches must equal the statement amount; split matches must add up to the ledger amount.'; end if;
		if exists (
			select match.feed_item_id
			from public.group_accounting_reconciliation_line_matches match
			join public.group_accounting_reconciliation_statement_lines line on line.id = match.statement_line_id
			join public.group_accounting_bank_feed_items feed on feed.id = match.feed_item_id
			where match.reconciliation_id = reconciliation.id and match.match_status = 'confirmed'
				and match.feed_item_id is not null
			group by match.feed_item_id, feed.amount_cents
			having (count(*) > 1 and not bool_and(match.is_split))
				or (bool_or(match.is_split) and count(*) < 2)
				or sum(line.amount_cents::bigint) <> case
					when account.normal_side = 'credit' then -feed.amount_cents::bigint
					else feed.amount_cents::bigint
				end
		) then raise exception 'Feed matches must equal the statement amount; split feed allocations must be marked and add up to the feed amount.'; end if;

		select coalesce(array_agg(distinct feed_item_id), '{}'::uuid[])
		into expected_feed_ids
		from public.group_accounting_reconciliation_line_matches
		where reconciliation_id = reconciliation.id and match_status = 'confirmed' and feed_item_id is not null;
		select coalesce(array_agg(distinct entry_id), '{}'::uuid[])
		into expected_entry_ids
		from public.group_accounting_reconciliation_line_matches
		where reconciliation_id = reconciliation.id and match_status = 'confirmed' and entry_id is not null;
		if exists (select 1 from unnest(feed_ids) selected(id) where not selected.id = any(expected_feed_ids))
			or exists (select 1 from unnest(expected_feed_ids) expected(id) where not expected.id = any(feed_ids))
			or exists (select 1 from unnest(entry_ids) selected(id) where not selected.id = any(expected_entry_ids))
			or exists (select 1 from unnest(expected_entry_ids) expected(id) where not expected.id = any(entry_ids)) then
			raise exception 'Selected bank-feed and ledger activity must exactly match confirmed statement decisions.';
		end if;

		-- When statements are adjacent, require the next opening balance to match
		-- the last completed close. Gaps remain possible for first-time imports.
		select * into previous from public.group_accounting_reconciliations
		where group_id = p_group_id and account_id = reconciliation.account_id and status = 'completed'
			and statement_ending_date < reconciliation.statement_ending_date
		order by statement_ending_date desc limit 1;
		if found and reconciliation.period_start_date <= previous.statement_ending_date then
			raise exception 'The statement period overlaps a previous completed reconciliation.';
		end if;
		if found and previous.statement_ending_date + 1 = reconciliation.period_start_date
			and previous.statement_ending_balance_cents <> reconciliation.opening_balance_cents then
			raise exception 'The opening balance must match the previous completed statement.';
		end if;
	else
		if exists (
			select 1 from public.group_accounting_bank_feed_items feed
			where feed.id = any(feed_ids) and feed.group_id = p_group_id
				and reconciliation.period_start_date is not null
				and feed.transaction_date < reconciliation.period_start_date - 14
		) then raise exception 'Selected activity falls before the reconciliation period.'; end if;
	end if;

	-- The guarded legacy completion RPC selects the latest draft by account and
	-- ending date. Refuse ambiguous sessions and verify the returned identity so
	-- a duplicate draft can never clear activity under the wrong statement.
	select count(*) into active_draft_count from public.group_accounting_reconciliations
	where group_id = p_group_id and account_id = reconciliation.account_id
		and statement_ending_date = reconciliation.statement_ending_date and status = 'draft';
	if active_draft_count <> 1 then
		raise exception 'Resolve duplicate drafts for this statement before closing it.';
	end if;

	statement_file := case when reconciliation.statement_object_path is null then null else jsonb_build_object(
		'object_path', reconciliation.statement_object_path,
		'file_name', reconciliation.statement_file_name,
		'mime_type', reconciliation.statement_mime_type,
		'size_bytes', reconciliation.statement_size_bytes
	) end;
	perform set_config('app.group_accounting_statement_close', reconciliation.id::text, true);
	result := public.group_accounting_complete_reconciliation(
		p_group_id,
		reconciliation.account_id,
		reconciliation.statement_ending_date,
		reconciliation.statement_ending_balance_cents,
		feed_ids,
		entry_ids,
		statement_file,
		p_actor_id
	);
	perform set_config('app.group_accounting_statement_close', '', true);
	if (result->>'id')::uuid is distinct from reconciliation.id then
		raise exception 'The reconciliation close did not update the selected statement session.';
	end if;
	if result->>'status' is distinct from 'completed' then
		raise exception 'The ledger balance does not equal the statement balance; the reconciliation remains open.';
	end if;
	v_verification_status := case
		when result->>'status' <> 'completed' then 'pending'
		when reconciliation.verification_mode = 'statement' and not exists (
			select 1
			from public.group_accounting_reconciliation_statement_lines line
			where line.reconciliation_id = reconciliation.id
				and line.resolution in ('ignored', 'approved_exception')
		) and not exists (
			select 1
			from public.group_accounting_reconciliation_line_matches match
			where match.reconciliation_id = reconciliation.id
				and match.match_status = 'confirmed' and match.feed_item_id is null
		) then 'verified'
		when reconciliation.verification_mode = 'statement' then 'qualified'
		else 'unverified'
	end;
	update public.group_accounting_reconciliations
	set verification_status = v_verification_status
	where id = reconciliation.id;
	insert into public.group_accounting_audit_events (
		group_id, actor_user_id, event_type, entity_type, entity_id, before_json, after_json, metadata
	) values (
		p_group_id, p_actor_id, 'close_reconciliation_session', 'reconciliation', reconciliation.id,
		to_jsonb(reconciliation), result,
		jsonb_build_object(
			'verification_mode', reconciliation.verification_mode,
			'verification_status', v_verification_status,
			'statement_line_count', reconciliation.statement_line_count,
			'unverified_attestation', reconciliation.verification_mode = 'balance_only'
		)
	);
	return result || jsonb_build_object(
		'verification_mode', reconciliation.verification_mode,
		'verification_status', v_verification_status,
		'statement_line_count', reconciliation.statement_line_count
	);
end;
$$;

revoke all on function public.group_accounting_close_reconciliation(uuid, uuid, uuid[], uuid[], uuid)
	from public, anon, authenticated;
grant execute on function public.group_accounting_close_reconciliation(uuid, uuid, uuid[], uuid[], uuid)
	to service_role;

-- Reopening a statement-backed close returns its evidence status to pending so
-- the draft cannot be presented as verified while the close is under review.
create or replace function public.group_accounting_reopen_reconciliation(
	p_group_id uuid,p_reconciliation_id uuid,p_actor_id uuid,p_reason text
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
	current public.group_accounting_reconciliations;
	updated public.group_accounting_reconciliations;
	clean_reason text := left(trim(coalesce(p_reason,'')),500);
begin
	perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 0));
	if clean_reason='' then raise exception 'Add a reason for reopening this reconciliation.'; end if;
	select * into current from public.group_accounting_reconciliations
	where id=p_reconciliation_id and group_id=p_group_id for update;
	if not found then raise exception 'Reconciliation not found.'; end if;
	if current.status <> 'completed' then raise exception 'Only completed reconciliations can be reopened.'; end if;
	if exists(select 1 from public.group_accounting_reconciliations r where r.group_id=p_group_id and r.account_id=current.account_id and r.status='completed' and r.statement_ending_date>current.statement_ending_date) then raise exception 'Reopen later statements for this account first.'; end if;
	update public.group_accounting_reconciliations set status='draft',completed_by_user_id=null,completed_at=null,
		verification_status = case when current.verification_mode in ('statement','balance_only') then 'pending' else current.verification_status end,
		reopened_at=now(),reopened_by_user_id=p_actor_id,reopen_reason=clean_reason
	where id=current.id returning * into updated;
	update public.group_accounting_lines set cleared_at=null,reconciliation_id=null
	where group_id=p_group_id and reconciliation_id=current.id;
	update public.group_accounting_bank_feed_items set cleared_at=null,reconciliation_id=null
	where group_id=p_group_id and reconciliation_id=current.id;
	update public.group_accounting_entries e set locked_at=null
	where e.group_id=p_group_id and e.locked_at is not null
	and exists(select 1 from unnest(current.cleared_entry_ids) cleared(id) where cleared.id=e.id)
	and not exists(select 1 from public.group_accounting_lines l where l.entry_id=e.id and l.reconciliation_id is not null);
	insert into public.group_accounting_audit_events(group_id,actor_user_id,event_type,entity_type,entity_id,before_json,after_json,metadata)
	values(p_group_id,p_actor_id,'reopen_reconciliation','reconciliation',current.id,to_jsonb(current),to_jsonb(updated),jsonb_build_object('reason',clean_reason));
	return to_jsonb(updated);
end;
$$;
revoke all on function public.group_accounting_reopen_reconciliation(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.group_accounting_reopen_reconciliation(uuid,uuid,uuid,text) to service_role;
