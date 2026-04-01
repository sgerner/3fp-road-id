create table if not exists public.group_social_accounts (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	platform text not null check (platform in ('facebook', 'instagram')),
	meta_user_id text,
	meta_page_id text,
	meta_instagram_account_id text,
	account_name text not null,
	username text,
	access_token_encrypted text not null,
	refresh_token_encrypted text,
	token_expires_at timestamptz,
	scopes jsonb not null default '[]'::jsonb,
	status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'error')),
	metadata jsonb not null default '{}'::jsonb,
	created_by uuid,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	last_sync_at timestamptz,
	last_error text,
	unique (group_id, platform)
);

create index if not exists group_social_accounts_group_status_idx
	on public.group_social_accounts (group_id, status);

create index if not exists group_social_accounts_platform_idx
	on public.group_social_accounts (platform);

create table if not exists public.group_social_posts (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	created_by uuid not null,
	updated_by uuid,
	status text not null check (status in ('draft', 'scheduled', 'queued', 'publishing', 'published', 'failed', 'cancelled')),
	platforms jsonb not null default '[]'::jsonb,
	title text,
	caption text not null default '',
	ai_prompt text,
	media jsonb not null default '[]'::jsonb,
	scheduled_for timestamptz,
	schedule_bucket timestamptz,
	published_at timestamptz,
	publish_attempts integer not null default 0,
	last_publish_error text,
	meta_publish_results jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_social_posts_group_status_created_idx
	on public.group_social_posts (group_id, status, created_at desc);

create index if not exists group_social_posts_schedule_bucket_idx
	on public.group_social_posts (schedule_bucket asc)
	where status in ('scheduled', 'queued');

create index if not exists group_social_posts_group_schedule_idx
	on public.group_social_posts (group_id, schedule_bucket asc)
	where status in ('scheduled', 'queued');

create table if not exists public.group_social_comments (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	social_account_id uuid not null references public.group_social_accounts(id) on delete cascade,
	social_post_id uuid references public.group_social_posts(id) on delete set null,
	platform text not null check (platform in ('facebook', 'instagram')),
	meta_comment_id text not null,
	meta_media_id text,
	meta_parent_comment_id text,
	author_name text,
	author_username text,
	body text not null default '',
	is_hidden boolean not null default false,
	can_reply boolean not null default true,
	raw_payload jsonb not null default '{}'::jsonb,
	commented_at timestamptz not null,
	last_synced_at timestamptz not null default timezone('utc', now()),
	unique (platform, meta_comment_id)
);

create index if not exists group_social_comments_group_commented_idx
	on public.group_social_comments (group_id, commented_at desc);

create index if not exists group_social_comments_account_commented_idx
	on public.group_social_comments (social_account_id, commented_at desc);

create table if not exists public.group_social_comment_replies (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_comment_id uuid not null references public.group_social_comments(id) on delete cascade,
	group_id uuid not null references public.groups(id) on delete cascade,
	social_account_id uuid not null references public.group_social_accounts(id) on delete cascade,
	created_by uuid not null,
	body text not null,
	status text not null default 'sent' check (status in ('draft', 'sending', 'sent', 'failed')),
	meta_reply_id text,
	error_text text,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_social_comment_replies_comment_idx
	on public.group_social_comment_replies (group_comment_id, created_at desc);

create table if not exists public.group_social_oauth_states (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	user_id uuid not null,
	provider text not null check (provider in ('facebook', 'instagram')),
	state_token text not null unique,
	code_verifier text,
	redirect_to text,
	expires_at timestamptz not null,
	created_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_social_oauth_states_provider_expires_idx
	on public.group_social_oauth_states (provider, expires_at asc);

create or replace function public.claim_group_social_posts(target_batch_size integer default 20)
returns setof public.group_social_posts
language plpgsql
security definer
set search_path = public
as $$
declare
	batch_size integer := greatest(1, least(coalesce(target_batch_size, 20), 100));
begin
	return query
	with due as (
		select p.id
		from public.group_social_posts p
		where p.status in ('scheduled', 'queued')
			and p.schedule_bucket is not null
			and p.schedule_bucket <= timezone('utc', now())
			and p.publish_attempts < 3
		order by p.schedule_bucket asc, p.created_at asc
		for update skip locked
		limit batch_size
	),
	updated as (
		update public.group_social_posts p
		set
			status = 'publishing',
			publish_attempts = p.publish_attempts + 1,
			updated_at = timezone('utc', now())
		from due
		where p.id = due.id
		returning p.*
	)
	select * from updated;
end;
$$;

revoke all on function public.claim_group_social_posts(integer) from public;;
