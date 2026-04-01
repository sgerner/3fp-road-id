create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1
		from public.profiles p
		where p.user_id = auth.uid()
			and p.admin = true
	);
$$;

create or replace function public.is_group_membership_manager(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select
		public.is_site_admin()
		or exists (
			select 1
			from public.group_members gm
			where gm.group_id = target_group_id
				and gm.user_id = auth.uid()
				and gm.role in ('owner', 'admin')
		);
$$;

create table if not exists public.group_membership_programs (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null unique references public.groups(id) on delete cascade,
	enabled boolean not null default true,
	access_mode text not null default 'public' check (access_mode in ('public', 'private_request')),
	cta_label text not null default 'Join Membership',
	contribution_mode text not null default 'none' check (contribution_mode in ('none', 'required_fee', 'donation')),
	default_tier_id uuid,
	policy_markdown text,
	policy_version integer not null default 1,
	policy_updated_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.group_membership_tiers (
	id uuid primary key default extensions.uuid_generate_v4(),
	program_id uuid not null references public.group_membership_programs(id) on delete cascade,
	name text not null,
	description text,
	amount_cents integer not null default 0 check (amount_cents >= 0),
	currency text not null default 'usd',
	billing_type text not null default 'one_time' check (billing_type in ('one_time', 'recurring')),
	interval_unit text check (interval_unit in ('week', 'month', 'year')),
	interval_count integer check (interval_count is null or interval_count > 0),
	is_default boolean not null default false,
	is_active boolean not null default true,
	sort_order integer not null default 0,
	allow_custom_amount boolean not null default false,
	min_amount_cents integer check (min_amount_cents is null or min_amount_cents >= 0),
	stripe_price_id text,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	check (
		(billing_type = 'one_time' and interval_unit is null and interval_count is null)
		or (billing_type = 'recurring' and interval_unit is not null and interval_count is not null)
	),
	check (
		allow_custom_amount = false
		or (allow_custom_amount = true and min_amount_cents is not null)
	)
);

create index if not exists group_membership_tiers_program_id_idx
	on public.group_membership_tiers (program_id, is_active, sort_order);

create unique index if not exists group_membership_tiers_default_unique
	on public.group_membership_tiers (program_id)
	where is_default = true and is_active = true;

create table if not exists public.group_membership_form_fields (
	id uuid primary key default extensions.uuid_generate_v4(),
	program_id uuid not null references public.group_membership_programs(id) on delete cascade,
	field_type text not null check (field_type in ('text', 'textarea', 'email', 'phone', 'number', 'select', 'multiselect', 'checkbox', 'date')),
	label text not null,
	help_text text,
	required boolean not null default false,
	options_json jsonb not null default '[]'::jsonb,
	sort_order integer not null default 0,
	active boolean not null default true,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_membership_form_fields_program_id_idx
	on public.group_membership_form_fields (program_id, active, sort_order);

create table if not exists public.group_membership_applications (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	status text not null default 'submitted' check (
		status in (
			'submitted',
			'under_review',
			'approved',
			'rejected',
			'withdrawn',
			'payment_pending',
			'completed'
		)
	),
	selected_tier_id uuid references public.group_membership_tiers(id) on delete set null,
	reviewed_by uuid references auth.users(id) on delete set null,
	reviewed_at timestamptz,
	review_notes text,
	policy_version_accepted integer,
	submitted_at timestamptz not null default timezone('utc', now()),
	payment_link_expires_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_membership_applications_group_status_idx
	on public.group_membership_applications (group_id, status, submitted_at desc);

create index if not exists group_membership_applications_user_idx
	on public.group_membership_applications (user_id, submitted_at desc);

create table if not exists public.group_membership_application_answers (
	id uuid primary key default extensions.uuid_generate_v4(),
	application_id uuid not null references public.group_membership_applications(id) on delete cascade,
	field_id uuid not null references public.group_membership_form_fields(id) on delete cascade,
	value_json jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (application_id, field_id)
);

create table if not exists public.group_memberships (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	tier_id uuid references public.group_membership_tiers(id) on delete set null,
	status text not null default 'active' check (status in ('active', 'past_due', 'cancelled', 'expired', 'paused')),
	source text not null default 'online' check (source in ('online', 'manual_offline')),
	started_at timestamptz not null default timezone('utc', now()),
	renews_at timestamptz,
	ends_at timestamptz,
	cancel_at_period_end boolean not null default false,
	manual_payment_notes text,
	created_by_owner_id uuid references auth.users(id) on delete set null,
	created_from_application_id uuid references public.group_membership_applications(id) on delete set null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_memberships_group_status_idx
	on public.group_memberships (group_id, status, renews_at);

create index if not exists group_memberships_user_idx
	on public.group_memberships (user_id, group_id, created_at desc);

create table if not exists public.group_membership_billing (
	id uuid primary key default extensions.uuid_generate_v4(),
	membership_id uuid not null unique references public.group_memberships(id) on delete cascade,
	stripe_customer_id text,
	stripe_subscription_id text unique,
	stripe_price_id text,
	last_invoice_id text,
	last_payment_status text,
	next_billing_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_membership_billing_subscription_idx
	on public.group_membership_billing (stripe_subscription_id);

create table if not exists public.group_membership_tier_change_requests (
	id uuid primary key default extensions.uuid_generate_v4(),
	membership_id uuid not null references public.group_memberships(id) on delete cascade,
	requested_tier_id uuid not null references public.group_membership_tiers(id) on delete restrict,
	effective_at_cycle_end boolean not null default true,
	status text not null default 'pending' check (status in ('pending', 'applied', 'cancelled')),
	requested_by uuid references auth.users(id) on delete set null,
	applied_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_membership_tier_change_requests_membership_idx
	on public.group_membership_tier_change_requests (membership_id, status, created_at desc);

create unique index if not exists group_membership_tier_change_pending_unique
	on public.group_membership_tier_change_requests (membership_id)
	where status = 'pending';

create table if not exists public.group_membership_emails (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	campaign_name text not null,
	audience_filters jsonb not null default '{}'::jsonb,
	subject_template text not null,
	body_template text not null,
	status text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed')),
	scheduled_at timestamptz,
	sent_at timestamptz,
	sent_count integer not null default 0,
	failed_count integer not null default 0,
	created_by uuid references auth.users(id) on delete set null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_membership_emails_group_created_idx
	on public.group_membership_emails (group_id, created_at desc);

create index if not exists group_membership_emails_group_status_schedule_idx
	on public.group_membership_emails (group_id, status, scheduled_at);

create table if not exists public.group_membership_email_sends (
	id uuid primary key default extensions.uuid_generate_v4(),
	email_id uuid not null references public.group_membership_emails(id) on delete cascade,
	membership_id uuid references public.group_memberships(id) on delete set null,
	recipient_user_id uuid references auth.users(id) on delete set null,
	recipient_email text,
	send_state text not null default 'pending' check (send_state in ('pending', 'sent', 'failed', 'skipped')),
	error_text text,
	sent_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (email_id, recipient_user_id)
);

create index if not exists group_membership_email_sends_email_state_idx
	on public.group_membership_email_sends (email_id, send_state, created_at);

create table if not exists public.group_membership_audit_log (
	id uuid primary key default extensions.uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	actor_user_id uuid references auth.users(id) on delete set null,
	action text not null,
	entity_type text not null,
	entity_id text,
	before_snapshot jsonb,
	after_snapshot jsonb,
	created_at timestamptz not null default timezone('utc', now())
);

create index if not exists group_membership_audit_group_created_idx
	on public.group_membership_audit_log (group_id, created_at desc);

alter table public.group_membership_programs
	drop constraint if exists group_membership_programs_default_tier_id_fkey;

alter table public.group_membership_programs
	add constraint group_membership_programs_default_tier_id_fkey
	foreign key (default_tier_id)
	references public.group_membership_tiers(id)
	on delete set null;

alter table public.group_membership_programs enable row level security;
alter table public.group_membership_tiers enable row level security;
alter table public.group_membership_form_fields enable row level security;
alter table public.group_membership_applications enable row level security;
alter table public.group_membership_application_answers enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_membership_billing enable row level security;
alter table public.group_membership_tier_change_requests enable row level security;
alter table public.group_membership_emails enable row level security;
alter table public.group_membership_email_sends enable row level security;
alter table public.group_membership_audit_log enable row level security;

drop policy if exists "membership_programs_select" on public.group_membership_programs;
create policy "membership_programs_select"
	on public.group_membership_programs
	for select
	using (
		public.is_group_membership_manager(group_id)
		or (enabled = true and access_mode = 'public')
		or (enabled = true and auth.uid() is not null)
	);

drop policy if exists "membership_programs_manage" on public.group_membership_programs;
create policy "membership_programs_manage"
	on public.group_membership_programs
	for all
	using (public.is_group_membership_manager(group_id))
	with check (public.is_group_membership_manager(group_id));

drop policy if exists "membership_tiers_select" on public.group_membership_tiers;
create policy "membership_tiers_select"
	on public.group_membership_tiers
	for select
	using (
		exists (
			select 1
			from public.group_membership_programs p
			where p.id = program_id
				and (
					public.is_group_membership_manager(p.group_id)
					or (p.enabled = true and p.access_mode = 'public')
					or (p.enabled = true and auth.uid() is not null)
				)
		)
	);

drop policy if exists "membership_tiers_manage" on public.group_membership_tiers;
create policy "membership_tiers_manage"
	on public.group_membership_tiers
	for all
	using (
		exists (
			select 1
			from public.group_membership_programs p
			where p.id = program_id
				and public.is_group_membership_manager(p.group_id)
		)
	)
	with check (
		exists (
			select 1
			from public.group_membership_programs p
			where p.id = program_id
				and public.is_group_membership_manager(p.group_id)
		)
	);

drop policy if exists "membership_form_fields_select" on public.group_membership_form_fields;
create policy "membership_form_fields_select"
	on public.group_membership_form_fields
	for select
	using (
		exists (
			select 1
			from public.group_membership_programs p
			where p.id = program_id
				and (
					public.is_group_membership_manager(p.group_id)
					or (p.enabled = true and p.access_mode = 'public')
					or (p.enabled = true and auth.uid() is not null)
				)
		)
	);

drop policy if exists "membership_form_fields_manage" on public.group_membership_form_fields;
create policy "membership_form_fields_manage"
	on public.group_membership_form_fields
	for all
	using (
		exists (
			select 1
			from public.group_membership_programs p
			where p.id = program_id
				and public.is_group_membership_manager(p.group_id)
		)
	)
	with check (
		exists (
			select 1
			from public.group_membership_programs p
			where p.id = program_id
				and public.is_group_membership_manager(p.group_id)
		)
	);

drop policy if exists "membership_applications_select" on public.group_membership_applications;
create policy "membership_applications_select"
	on public.group_membership_applications
	for select
	using (
		user_id = auth.uid()
		or public.is_group_membership_manager(group_id)
	);

drop policy if exists "membership_applications_insert" on public.group_membership_applications;
create policy "membership_applications_insert"
	on public.group_membership_applications
	for insert
	with check (user_id = auth.uid());

drop policy if exists "membership_applications_update" on public.group_membership_applications;
create policy "membership_applications_update"
	on public.group_membership_applications
	for update
	using (
		user_id = auth.uid()
		or public.is_group_membership_manager(group_id)
	)
	with check (
		user_id = auth.uid()
		or public.is_group_membership_manager(group_id)
	);

drop policy if exists "membership_application_answers_select" on public.group_membership_application_answers;
create policy "membership_application_answers_select"
	on public.group_membership_application_answers
	for select
	using (
		exists (
			select 1
			from public.group_membership_applications a
			where a.id = application_id
				and (
					a.user_id = auth.uid()
					or public.is_group_membership_manager(a.group_id)
				)
		)
	);

drop policy if exists "membership_application_answers_insert" on public.group_membership_application_answers;
create policy "membership_application_answers_insert"
	on public.group_membership_application_answers
	for insert
	with check (
		exists (
			select 1
			from public.group_membership_applications a
			where a.id = application_id
				and a.user_id = auth.uid()
		)
	);

drop policy if exists "membership_application_answers_update" on public.group_membership_application_answers;
create policy "membership_application_answers_update"
	on public.group_membership_application_answers
	for update
	using (
		exists (
			select 1
			from public.group_membership_applications a
			where a.id = application_id
				and (
					a.user_id = auth.uid()
					or public.is_group_membership_manager(a.group_id)
				)
		)
	)
	with check (
		exists (
			select 1
			from public.group_membership_applications a
			where a.id = application_id
				and (
					a.user_id = auth.uid()
					or public.is_group_membership_manager(a.group_id)
				)
		)
	);

drop policy if exists "memberships_select" on public.group_memberships;
create policy "memberships_select"
	on public.group_memberships
	for select
	using (
		user_id = auth.uid()
		or public.is_group_membership_manager(group_id)
	);

drop policy if exists "memberships_insert" on public.group_memberships;
create policy "memberships_insert"
	on public.group_memberships
	for insert
	with check (
		user_id = auth.uid()
		or public.is_group_membership_manager(group_id)
	);

drop policy if exists "memberships_update" on public.group_memberships;
create policy "memberships_update"
	on public.group_memberships
	for update
	using (
		user_id = auth.uid()
		or public.is_group_membership_manager(group_id)
	)
	with check (
		user_id = auth.uid()
		or public.is_group_membership_manager(group_id)
	);

drop policy if exists "membership_billing_select" on public.group_membership_billing;
create policy "membership_billing_select"
	on public.group_membership_billing
	for select
	using (
		exists (
			select 1
			from public.group_memberships m
			where m.id = membership_id
				and (
					m.user_id = auth.uid()
					or public.is_group_membership_manager(m.group_id)
				)
		)
	);

drop policy if exists "membership_billing_manage" on public.group_membership_billing;
create policy "membership_billing_manage"
	on public.group_membership_billing
	for all
	using (
		exists (
			select 1
			from public.group_memberships m
			where m.id = membership_id
				and public.is_group_membership_manager(m.group_id)
		)
	)
	with check (
		exists (
			select 1
			from public.group_memberships m
			where m.id = membership_id
				and public.is_group_membership_manager(m.group_id)
		)
	);

drop policy if exists "membership_tier_change_select" on public.group_membership_tier_change_requests;
create policy "membership_tier_change_select"
	on public.group_membership_tier_change_requests
	for select
	using (
		exists (
			select 1
			from public.group_memberships m
			where m.id = membership_id
				and (
					m.user_id = auth.uid()
					or public.is_group_membership_manager(m.group_id)
				)
		)
	);

drop policy if exists "membership_tier_change_insert" on public.group_membership_tier_change_requests;
create policy "membership_tier_change_insert"
	on public.group_membership_tier_change_requests
	for insert
	with check (
		exists (
			select 1
			from public.group_memberships m
			where m.id = membership_id
				and (
					m.user_id = auth.uid()
					or public.is_group_membership_manager(m.group_id)
				)
		)
	);

drop policy if exists "membership_tier_change_update" on public.group_membership_tier_change_requests;
create policy "membership_tier_change_update"
	on public.group_membership_tier_change_requests
	for update
	using (
		exists (
			select 1
			from public.group_memberships m
			where m.id = membership_id
				and public.is_group_membership_manager(m.group_id)
		)
	)
	with check (
		exists (
			select 1
			from public.group_memberships m
			where m.id = membership_id
				and public.is_group_membership_manager(m.group_id)
		)
	);

drop policy if exists "membership_emails_select" on public.group_membership_emails;
create policy "membership_emails_select"
	on public.group_membership_emails
	for select
	using (public.is_group_membership_manager(group_id));

drop policy if exists "membership_emails_manage" on public.group_membership_emails;
create policy "membership_emails_manage"
	on public.group_membership_emails
	for all
	using (public.is_group_membership_manager(group_id))
	with check (public.is_group_membership_manager(group_id));

drop policy if exists "membership_email_sends_select" on public.group_membership_email_sends;
create policy "membership_email_sends_select"
	on public.group_membership_email_sends
	for select
	using (
		exists (
			select 1
			from public.group_membership_emails e
			where e.id = email_id
				and public.is_group_membership_manager(e.group_id)
		)
	);

drop policy if exists "membership_email_sends_manage" on public.group_membership_email_sends;
create policy "membership_email_sends_manage"
	on public.group_membership_email_sends
	for all
	using (
		exists (
			select 1
			from public.group_membership_emails e
			where e.id = email_id
				and public.is_group_membership_manager(e.group_id)
		)
	)
	with check (
		exists (
			select 1
			from public.group_membership_emails e
			where e.id = email_id
				and public.is_group_membership_manager(e.group_id)
		)
	);

-- No explicit policies for audit log: only service-role/server-side writes should be possible.;
