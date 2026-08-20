create table if not exists public.group_email_subscribers (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	email text not null,
	first_name text,
	status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
	consent_at timestamptz not null default timezone('utc', now()),
	unsubscribed_at timestamptz,
	source text not null default 'website',
	unsubscribe_token uuid not null default extensions.uuid_generate_v4(),
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (group_id, email),
	unique (unsubscribe_token)
);

create index if not exists group_email_subscribers_group_status_idx
	on public.group_email_subscribers (group_id, status, created_at desc);

alter table public.group_email_subscribers enable row level security;

drop policy if exists "group_email_subscribers_manage" on public.group_email_subscribers;
create policy "group_email_subscribers_manage"
	on public.group_email_subscribers
	for select
	to authenticated
	using (
		exists (
			select 1
			from public.profiles p
			where p.user_id = auth.uid() and p.admin = true
		)
		or exists (
			select 1
			from public.group_members gm
			where gm.group_id = group_email_subscribers.group_id
				and gm.user_id = auth.uid()
				and gm.role = 'owner'
		)
	);

alter table public.group_membership_email_sends
	add column if not exists subscriber_id uuid references public.group_email_subscribers(id) on delete set null;

create unique index if not exists group_membership_email_sends_subscriber_unique
	on public.group_membership_email_sends (email_id, subscriber_id);
