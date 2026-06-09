alter table public.group_accounting_entries
	add column if not exists locked_at timestamptz,
	add column if not exists reversed_entry_id uuid references public.group_accounting_entries(id) on delete set null;

alter table public.group_accounting_lines
	add column if not exists cleared_at timestamptz,
	add column if not exists reconciliation_id uuid references public.group_accounting_reconciliations(id) on delete set null;

alter table public.group_accounting_bank_connections
	add column if not exists access_token_ciphertext text,
	add column if not exists refresh_token_ciphertext text,
	add column if not exists sync_cursor text,
	add column if not exists institution_name text;

alter table public.group_accounting_bank_feed_items
	add column if not exists cleared_at timestamptz,
	add column if not exists reconciliation_id uuid references public.group_accounting_reconciliations(id) on delete set null,
	add column if not exists match_confidence numeric(5, 4),
	add column if not exists match_reason text;

alter table public.group_accounting_receipts
	add column if not exists extracted_text text,
	add column if not exists extracted_fields jsonb not null default '{}'::jsonb,
	add column if not exists duplicate_of_receipt_id uuid references public.group_accounting_receipts(id) on delete set null;

alter table public.group_accounting_public_reports
	add column if not exists slug text,
	add column if not exists share_token text not null default encode(extensions.gen_random_bytes(12), 'hex');

create unique index if not exists group_accounting_public_reports_group_slug_unique
	on public.group_accounting_public_reports (group_id, slug)
	where slug is not null;

create table if not exists public.group_accounting_provider_accounts (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	connection_id uuid not null references public.group_accounting_bank_connections(id) on delete cascade,
	account_id uuid references public.group_accounting_accounts(id) on delete set null,
	provider text not null,
	external_account_id text not null,
	display_name text not null,
	account_type text,
	account_subtype text,
	mask text,
	current_balance_cents integer,
	available_balance_cents integer,
	currency text not null default 'usd',
	is_enabled boolean not null default true,
	raw jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (group_id, provider, external_account_id)
);

create index if not exists group_accounting_provider_accounts_group_idx
	on public.group_accounting_provider_accounts (group_id, provider, is_enabled);

create table if not exists public.group_accounting_audit_events (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	actor_user_id uuid references auth.users(id) on delete set null,
	event_type text not null,
	entity_type text not null,
	entity_id uuid,
	before_json jsonb,
	after_json jsonb,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_accounting_audit_events_group_created_idx
	on public.group_accounting_audit_events (group_id, created_at desc);

create table if not exists public.group_accounting_exports (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	created_by_user_id uuid references auth.users(id) on delete set null,
	export_type text not null check (export_type in ('entries_csv', 'report_csv', 'budget_csv')),
	filter_json jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now())
);

alter table public.group_accounting_provider_accounts enable row level security;
alter table public.group_accounting_audit_events enable row level security;
alter table public.group_accounting_exports enable row level security;

do $$
declare
	t text;
begin
	foreach t in array array[
		'group_accounting_provider_accounts',
		'group_accounting_audit_events',
		'group_accounting_exports'
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

drop trigger if exists group_accounting_provider_accounts_set_updated_at on public.group_accounting_provider_accounts;
create trigger group_accounting_provider_accounts_set_updated_at
	before update on public.group_accounting_provider_accounts
	for each row
	execute function public.group_accounting_set_updated_at();
