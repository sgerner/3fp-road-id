create table if not exists public.merch_partner_accounts (
	id uuid primary key default extensions.uuid_generate_v4(),
	store_id uuid not null references public.merch_stores(id) on delete cascade,
	partner_provider text not null check (partner_provider in ('printful')),
	account_label text,
	external_account_id text,
	access_token text,
	refresh_token text,
	token_type text,
	scopes text[] not null default '{}'::text[],
	access_token_expires_at timestamptz,
	refresh_token_expires_at timestamptz,
	connected_at timestamptz,
	disconnected_at timestamptz,
	last_refreshed_at timestamptz,
	last_error text,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (store_id, partner_provider)
);

create index if not exists merch_partner_accounts_store_id_idx
	on public.merch_partner_accounts (store_id);;
