create table if not exists public.group_site_domains (
	id uuid primary key default uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	domain text not null unique,
	source text not null default 'existing',
	status text not null default 'pending_dns',
	vercel_project_id text,
	vercel_project_domain text,
	vercel_order_id text,
	vercel_verified boolean not null default false,
	dns_config jsonb not null default '{}'::jsonb,
	verification jsonb not null default '[]'::jsonb,
	auto_renew boolean not null default true,
	renewal_enabled boolean not null default true,
	renewal_status text not null default 'active',
	base_renewal_price_cents integer,
	renewal_markup_cents integer,
	renewal_stripe_fee_cents integer,
	next_renewal_charge_cents integer,
	renews_at timestamptz,
	stripe_customer_id text,
	stripe_payment_method_id text,
	last_payment_failed_at timestamptz,
	last_error text,
	created_by_user_id uuid references auth.users(id) on delete set null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	constraint group_site_domains_source_check check (source in ('existing', 'registered', 'transferred')),
	constraint group_site_domains_status_check check (
		status in ('pending_dns', 'verifying', 'active', 'provisioning', 'failed', 'disabled', 'expired')
	),
	constraint group_site_domains_renewal_status_check check (
		renewal_status in ('active', 'paused', 'failed', 'cancelled')
	)
);

create unique index if not exists group_site_domains_group_id_domain_unique
	on public.group_site_domains (group_id, domain);

create index if not exists group_site_domains_group_id_idx
	on public.group_site_domains (group_id, created_at desc);

create index if not exists group_site_domains_renewal_due_idx
	on public.group_site_domains (renewal_enabled, auto_renew, renewal_status, renews_at);

create table if not exists public.group_site_domain_orders (
	id uuid primary key default uuid_generate_v4(),
	group_id uuid not null references public.groups(id) on delete cascade,
	domain_id uuid references public.group_site_domains(id) on delete set null,
	requested_domain text not null,
	status text not null default 'quoted',
	years integer not null default 1,
	currency text not null default 'USD',
	base_price_cents integer not null,
	markup_cents integer not null,
	stripe_fee_cents integer not null,
	total_cents integer not null,
	contact_information jsonb not null default '{}'::jsonb,
	price_snapshot jsonb not null default '{}'::jsonb,
	vercel_order_id text unique,
	stripe_checkout_session_id text unique,
	stripe_payment_intent_id text unique,
	stripe_customer_id text,
	stripe_payment_method_id text,
	receipt_email text,
	last_error text,
	created_by_user_id uuid references auth.users(id) on delete set null,
	paid_at timestamptz,
	fulfilled_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	constraint group_site_domain_orders_status_check check (
		status in (
			'quoted',
			'checkout_pending',
			'paid',
			'registering',
			'registered',
			'failed',
			'cancelled',
			'refunded'
		)
	),
	constraint group_site_domain_orders_years_check check (years between 1 and 10),
	constraint group_site_domain_orders_total_check check (total_cents >= 0)
);

create index if not exists group_site_domain_orders_group_id_idx
	on public.group_site_domain_orders (group_id, created_at desc);

create index if not exists group_site_domain_orders_status_idx
	on public.group_site_domain_orders (status, created_at desc);

create table if not exists public.group_site_domain_events (
	id uuid primary key default uuid_generate_v4(),
	group_id uuid references public.groups(id) on delete cascade,
	domain_id uuid references public.group_site_domains(id) on delete cascade,
	order_id uuid references public.group_site_domain_orders(id) on delete cascade,
	provider text not null,
	event_type text not null,
	external_event_id text,
	payload jsonb not null default '{}'::jsonb,
	processing_status text not null default 'processed',
	error_message text,
	created_at timestamptz not null default timezone('utc', now()),
	constraint group_site_domain_events_provider_check check (provider in ('vercel', 'stripe', 'system')),
	constraint group_site_domain_events_processing_status_check check (
		processing_status in ('processed', 'ignored', 'failed')
	)
);

create unique index if not exists group_site_domain_events_provider_external_unique
	on public.group_site_domain_events (provider, external_event_id)
	where external_event_id is not null;

create index if not exists group_site_domain_events_domain_idx
	on public.group_site_domain_events (domain_id, created_at desc);
