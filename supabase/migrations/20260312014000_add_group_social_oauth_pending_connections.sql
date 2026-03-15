create table if not exists public.group_social_oauth_pending_connections (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	user_id uuid not null,
	provider text not null check (provider in ('facebook', 'instagram')),
	access_token_encrypted text not null,
	token_expires_at timestamptz,
	scopes jsonb not null default '[]'::jsonb,
	options jsonb not null default '[]'::jsonb,
	expires_at timestamptz not null,
	created_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_social_oauth_pending_group_user_idx
	on public.group_social_oauth_pending_connections (group_id, user_id, provider, expires_at);

alter table public.group_social_oauth_pending_connections enable row level security;
