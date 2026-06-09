create or replace function public.is_group_accounting_manager(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select
		coalesce(public.is_site_admin(), false)
		or exists (
			select 1
			from public.group_members gm
			where gm.group_id = target_group_id
				and gm.user_id = auth.uid()
				and gm.role in ('owner', 'admin')
		);
$$;

create table if not exists public.group_accounting_settings (
	group_id uuid primary key references public.groups(id) on delete cascade,
	enabled boolean not null default true,
	currency text not null default 'usd',
	fiscal_year_start_month integer not null default 1 check (fiscal_year_start_month between 1 and 12),
	public_reports_enabled boolean not null default false,
	public_visibility jsonb not null default '{"activity":true,"position":true,"budgets":false,"cash":true,"notes":true}'::jsonb,
	mercury_api_key_ciphertext text,
	mercury_api_key_hint text,
	mercury_connected_at timestamptz,
	plaid_access_token_ciphertext text,
	plaid_item_id text,
	plaid_connected_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.group_accounting_accounts (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	code text not null,
	name text not null,
	kind text not null check (kind in ('asset', 'liability', 'equity', 'income', 'expense')),
	subtype text not null,
	normal_side text not null check (normal_side in ('debit', 'credit')),
	display_group text not null,
	description text,
	is_system boolean not null default false,
	is_archived boolean not null default false,
	sort_order integer not null default 0,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (group_id, code)
);

create index if not exists group_accounting_accounts_group_kind_idx
	on public.group_accounting_accounts (group_id, kind, is_archived, sort_order);

create table if not exists public.group_accounting_entries (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	entry_date date not null default current_date,
	entry_type text not null default 'simple' check (entry_type in ('income', 'expense', 'transfer', 'journal', 'opening_balance', 'bank_feed', 'donation', 'membership')),
	status text not null default 'posted' check (status in ('draft', 'posted', 'void')),
	source text not null default 'manual',
	source_id text,
	description text not null,
	memo text,
	amount_cents integer not null default 0 check (amount_cents >= 0),
	currency text not null default 'usd',
	created_by_user_id uuid references auth.users(id) on delete set null,
	posted_at timestamptz,
	voided_at timestamptz,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (group_id, source, source_id)
);

create index if not exists group_accounting_entries_group_date_idx
	on public.group_accounting_entries (group_id, entry_date desc, created_at desc);

create table if not exists public.group_accounting_lines (
	id uuid primary key default extensions.uuid_generate_v4(),
	entry_id uuid not null references public.group_accounting_entries(id) on delete cascade,
	group_id uuid not null references public.groups(id) on delete cascade,
	account_id uuid not null references public.group_accounting_accounts(id) on delete restrict,
	description text,
	debit_cents integer not null default 0 check (debit_cents >= 0),
	credit_cents integer not null default 0 check (credit_cents >= 0),
	created_at timestamptz not null default timezone('utc', now()),
	check (
		(debit_cents > 0 and credit_cents = 0)
		or (credit_cents > 0 and debit_cents = 0)
	)
);

create index if not exists group_accounting_lines_group_account_idx
	on public.group_accounting_lines (group_id, account_id);

create table if not exists public.group_accounting_budgets (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	account_id uuid not null references public.group_accounting_accounts(id) on delete cascade,
	year integer not null check (year between 2000 and 2200),
	amount_cents integer not null default 0 check (amount_cents >= 0),
	monthly_amounts jsonb not null default '{}'::jsonb,
	notes text,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (group_id, account_id, year)
);

create table if not exists public.group_accounting_bank_connections (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	provider text not null check (provider in ('stripe', 'plaid', 'mercury', 'manual')),
	display_name text not null,
	status text not null default 'setup_needed' check (status in ('setup_needed', 'connected', 'error', 'disabled')),
	external_id text,
	last_synced_at timestamptz,
	error_message text,
	config jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (group_id, provider)
);

create index if not exists group_accounting_bank_connections_group_idx
	on public.group_accounting_bank_connections (group_id, provider, status);

create table if not exists public.group_accounting_bank_feed_items (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	connection_id uuid references public.group_accounting_bank_connections(id) on delete set null,
	account_id uuid references public.group_accounting_accounts(id) on delete set null,
	provider text not null default 'manual',
	source_transaction_id text not null,
	transaction_date date not null,
	description text not null,
	amount_cents integer not null,
	currency text not null default 'usd',
	status text not null default 'needs_review' check (status in ('needs_review', 'posted', 'matched', 'ignored')),
	matched_entry_id uuid references public.group_accounting_entries(id) on delete set null,
	suggested_account_id uuid references public.group_accounting_accounts(id) on delete set null,
	raw jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (group_id, provider, source_transaction_id)
);

create index if not exists group_accounting_bank_feed_items_group_status_idx
	on public.group_accounting_bank_feed_items (group_id, status, transaction_date desc);

create table if not exists public.group_accounting_reconciliations (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	account_id uuid not null references public.group_accounting_accounts(id) on delete cascade,
	statement_ending_date date not null,
	statement_ending_balance_cents integer not null,
	book_balance_cents integer not null default 0,
	difference_cents integer not null default 0,
	status text not null default 'draft' check (status in ('draft', 'completed')),
	checked_feed_item_ids uuid[] not null default '{}',
	completed_by_user_id uuid references auth.users(id) on delete set null,
	completed_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.group_accounting_receipts (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	entry_id uuid references public.group_accounting_entries(id) on delete set null,
	uploaded_by_user_id uuid references auth.users(id) on delete set null,
	bucket_id text not null default 'group-accounting-receipts',
	object_path text not null unique,
	file_name text not null,
	mime_type text,
	size_bytes bigint,
	classification_status text not null default 'pending' check (classification_status in ('pending', 'classified', 'failed')),
	classification jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_accounting_receipts_group_entry_idx
	on public.group_accounting_receipts (group_id, entry_id, created_at desc);

create table if not exists public.group_accounting_public_reports (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	title text not null,
	report_period_start date not null,
	report_period_end date not null,
	visibility jsonb not null default '{}'::jsonb,
	snapshot jsonb not null,
	notes text,
	published boolean not null default true,
	published_by_user_id uuid references auth.users(id) on delete set null,
	published_at timestamptz not null default timezone('utc', now()),
	created_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_accounting_public_reports_group_published_idx
	on public.group_accounting_public_reports (group_id, published, published_at desc);

create or replace function public.group_accounting_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
	new.updated_at := timezone('utc', now());
	return new;
end;
$$;

do $$
declare
	t text;
begin
	foreach t in array array[
		'group_accounting_settings',
		'group_accounting_accounts',
		'group_accounting_entries',
		'group_accounting_budgets',
		'group_accounting_bank_connections',
		'group_accounting_bank_feed_items',
		'group_accounting_reconciliations',
		'group_accounting_receipts'
	]
	loop
		execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
		execute format(
			'create trigger %I before update on public.%I for each row execute function public.group_accounting_set_updated_at()',
			t || '_set_updated_at',
			t
		);
	end loop;
end
$$;

alter table public.group_accounting_settings enable row level security;
alter table public.group_accounting_accounts enable row level security;
alter table public.group_accounting_entries enable row level security;
alter table public.group_accounting_lines enable row level security;
alter table public.group_accounting_budgets enable row level security;
alter table public.group_accounting_bank_connections enable row level security;
alter table public.group_accounting_bank_feed_items enable row level security;
alter table public.group_accounting_reconciliations enable row level security;
alter table public.group_accounting_receipts enable row level security;
alter table public.group_accounting_public_reports enable row level security;

do $$
declare
	t text;
begin
	foreach t in array array[
		'group_accounting_settings',
		'group_accounting_accounts',
		'group_accounting_entries',
		'group_accounting_lines',
		'group_accounting_budgets',
		'group_accounting_bank_connections',
		'group_accounting_bank_feed_items',
		'group_accounting_reconciliations',
		'group_accounting_receipts'
	]
	loop
		execute format('drop policy if exists %I on public.%I', t || '_manager_select', t);
		execute format('drop policy if exists %I on public.%I', t || '_manager_write', t);
		execute format(
			'create policy %I on public.%I for select using (public.is_group_accounting_manager(group_id))',
			t || '_manager_select',
			t
		);
		execute format(
			'create policy %I on public.%I for all using (public.is_group_accounting_manager(group_id)) with check (public.is_group_accounting_manager(group_id))',
			t || '_manager_write',
			t
		);
	end loop;
end
$$;

drop policy if exists group_accounting_public_reports_manager_select on public.group_accounting_public_reports;
create policy group_accounting_public_reports_manager_select
	on public.group_accounting_public_reports
	for select
	using (public.is_group_accounting_manager(group_id));

drop policy if exists group_accounting_public_reports_public_select on public.group_accounting_public_reports;
create policy group_accounting_public_reports_public_select
	on public.group_accounting_public_reports
	for select
	to anon, authenticated
	using (published = true);

drop policy if exists group_accounting_public_reports_manager_write on public.group_accounting_public_reports;
create policy group_accounting_public_reports_manager_write
	on public.group_accounting_public_reports
	for all
	using (public.is_group_accounting_manager(group_id))
	with check (public.is_group_accounting_manager(group_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'group-accounting-receipts',
	'group-accounting-receipts',
	false,
	10485760,
	array[
		'image/jpeg',
		'image/png',
		'image/webp',
		'application/pdf',
		'text/plain',
		'text/csv'
	]
)
on conflict (id) do update
set public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
	if not exists (
		select 1
		from pg_policies
		where schemaname = 'storage'
			and tablename = 'objects'
			and policyname = 'group_accounting_receipts_manager'
	) then
		create policy "group_accounting_receipts_manager"
			on storage.objects
			for all
			to authenticated
			using (
				bucket_id = 'group-accounting-receipts'
				and public.is_group_accounting_manager((storage.foldername(name))[1]::uuid)
			)
			with check (
				bucket_id = 'group-accounting-receipts'
				and public.is_group_accounting_manager((storage.foldername(name))[1]::uuid)
			);
	end if;
end
$$;
