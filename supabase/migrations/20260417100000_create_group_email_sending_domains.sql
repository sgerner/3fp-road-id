create or replace function public.is_group_email_manager(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select public.is_group_membership_manager(target_group_id);
$$;

create table if not exists public.group_email_sending_domains (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	domain text not null,
	mail_from_subdomain text not null,
	from_name text,
	from_local_part text not null default 'hello',
	reply_to_email text,
	is_default boolean not null default false,
	status text not null default 'pending_dns' check (
		status in ('pending_dns', 'pending_verification', 'verified', 'failed')
	),
	ses_identity_arn text,
	ses_verified_for_sending boolean not null default false,
	ses_dkim_status text,
	ses_mail_from_status text,
	dns_records jsonb not null default '[]'::jsonb,
	verification_details jsonb not null default '{}'::jsonb,
	error_text text,
	created_by uuid references auth.users(id) on delete set null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	last_synced_at timestamptz,
	last_verified_at timestamptz,
	unique (group_id, domain)
);

create index if not exists group_email_sending_domains_group_updated_idx
	on public.group_email_sending_domains (group_id, updated_at desc);

create unique index if not exists group_email_sending_domains_default_idx
	on public.group_email_sending_domains (group_id)
	where is_default = true;

alter table public.group_email_sending_domains enable row level security;

drop policy if exists "group_email_domains_select" on public.group_email_sending_domains;
create policy "group_email_domains_select"
	on public.group_email_sending_domains
	for select
	using (public.is_group_email_manager(group_id));

drop policy if exists "group_email_domains_manage" on public.group_email_sending_domains;
create policy "group_email_domains_manage"
	on public.group_email_sending_domains
	for all
	using (public.is_group_email_manager(group_id))
	with check (public.is_group_email_manager(group_id));
