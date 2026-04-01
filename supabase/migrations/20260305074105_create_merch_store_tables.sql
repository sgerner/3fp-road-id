create table if not exists public.merch_stores (
	id uuid primary key default extensions.uuid_generate_v4(),
	slug text not null unique,
	name text not null,
	description text,
	group_id uuid unique references public.groups(id) on delete cascade,
	recipient_type text not null default 'organization' check (recipient_type in ('organization', 'group')),
	is_active boolean not null default true,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

insert into public.merch_stores (slug, name, description, recipient_type)
values ('main', '3 Feet Please Merch', 'Official merch from 3 Feet Please.', 'organization')
on conflict (slug) do nothing;

create table if not exists public.merch_tax_settings (
	store_id uuid primary key references public.merch_stores(id) on delete cascade,
	mode text not null default 'none' check (mode in ('none', 'flat_rate')),
	flat_rate_bps integer not null default 0 check (flat_rate_bps >= 0 and flat_rate_bps <= 2500),
	notes text,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

insert into public.merch_tax_settings (store_id, mode, flat_rate_bps, notes)
select id, 'none', 0, '3FP may remain below nexus thresholds and can disable tax collection.'
from public.merch_stores
where slug = 'main'
on conflict (store_id) do nothing;

create table if not exists public.merch_fulfillment_methods (
	id uuid primary key default extensions.uuid_generate_v4(),
	store_id uuid not null references public.merch_stores(id) on delete cascade,
	name text not null,
	method_type text not null default 'pickup' check (method_type in ('pickup', 'delivery', 'shipping')),
	description text,
	base_fee_cents integer not null default 0 check (base_fee_cents >= 0),
	requires_address boolean not null default false,
	is_active boolean not null default true,
	sort_order integer not null default 0,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists merch_fulfillment_methods_store_id_idx on public.merch_fulfillment_methods (store_id);

insert into public.merch_fulfillment_methods (
	store_id,
	name,
	method_type,
	description,
	base_fee_cents,
	requires_address,
	sort_order
)
select
	id,
	'Local Pickup',
	'pickup',
	'Coordinate a handoff with a 3FP organizer.',
	0,
	false,
	10
from public.merch_stores
where slug = 'main'
and not exists (
	select 1
	from public.merch_fulfillment_methods f
	where f.store_id = public.merch_stores.id
		and f.name = 'Local Pickup'
);

create table if not exists public.merch_products (
	id uuid primary key default extensions.uuid_generate_v4(),
	store_id uuid not null references public.merch_stores(id) on delete cascade,
	name text not null,
	slug text not null,
	description text,
	image_url text,
	status text not null default 'active' check (status in ('active', 'draft', 'archived')),
	default_partner text not null default 'manual' check (default_partner in ('manual', 'printful')),
	metadata jsonb not null default '{}'::jsonb,
	created_by_user_id uuid references auth.users(id) on delete set null,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (store_id, slug)
);

create index if not exists merch_products_store_id_status_idx
	on public.merch_products (store_id, status, created_at desc);

create table if not exists public.merch_product_variants (
	id uuid primary key default extensions.uuid_generate_v4(),
	product_id uuid not null references public.merch_products(id) on delete cascade,
	name text not null,
	sku text,
	option_values jsonb not null default '{}'::jsonb,
	partner_provider text not null default 'manual' check (partner_provider in ('manual', 'printful')),
	partner_variant_ref text,
	price_cents integer not null check (price_cents > 0),
	cost_cents integer,
	is_active boolean not null default true,
	sort_order integer not null default 0,
	inventory_count integer,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists merch_product_variants_product_id_active_idx
	on public.merch_product_variants (product_id, is_active, sort_order);

create table if not exists public.merch_orders (
	id uuid primary key default extensions.uuid_generate_v4(),
	order_number text not null unique,
	store_id uuid not null references public.merch_stores(id) on delete restrict,
	customer_user_id uuid references auth.users(id) on delete set null,
	customer_email text not null,
	customer_name text,
	customer_phone text,
	fulfillment_method_id uuid references public.merch_fulfillment_methods(id) on delete set null,
	fulfillment_snapshot jsonb not null default '{}'::jsonb,
	shipping_address jsonb not null default '{}'::jsonb,
	notes text,
	donation_cents integer not null default 0 check (donation_cents >= 0),
	subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
	tax_cents integer not null default 0 check (tax_cents >= 0),
	fulfillment_fee_cents integer not null default 0 check (fulfillment_fee_cents >= 0),
	total_cents integer not null default 0 check (total_cents >= 0),
	currency text not null default 'usd',
	status text not null default 'pending' check (
		status in ('pending', 'paid', 'processing', 'fulfilled', 'canceled', 'refunded', 'failed')
	),
	payment_status text not null default 'unpaid' check (
		payment_status in ('unpaid', 'paid', 'refunded', 'failed')
	),
	fulfillment_status text not null default 'not_started' check (
		fulfillment_status in ('not_started', 'queued', 'in_progress', 'fulfilled', 'failed')
	),
	stripe_checkout_session_id text unique,
	stripe_payment_intent_id text,
	stripe_connected_account_id text,
	email_customer_sent_at timestamptz,
	email_admin_sent_at timestamptz,
	paid_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists merch_orders_store_created_idx
	on public.merch_orders (store_id, created_at desc);
create index if not exists merch_orders_customer_email_idx
	on public.merch_orders (customer_email);
create index if not exists merch_orders_customer_user_id_idx
	on public.merch_orders (customer_user_id, created_at desc);

create table if not exists public.merch_order_items (
	id uuid primary key default extensions.uuid_generate_v4(),
	order_id uuid not null references public.merch_orders(id) on delete cascade,
	product_id uuid references public.merch_products(id) on delete set null,
	variant_id uuid references public.merch_product_variants(id) on delete set null,
	product_name text not null,
	variant_name text not null,
	sku text,
	quantity integer not null check (quantity > 0),
	unit_price_cents integer not null check (unit_price_cents >= 0),
	line_total_cents integer not null check (line_total_cents >= 0),
	partner_provider text not null default 'manual' check (partner_provider in ('manual', 'printful')),
	partner_variant_ref text,
	option_values jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default timezone('utc', now())
);

create index if not exists merch_order_items_order_id_idx on public.merch_order_items (order_id);

create table if not exists public.merch_dispatch_jobs (
	id uuid primary key default extensions.uuid_generate_v4(),
	order_id uuid not null references public.merch_orders(id) on delete cascade,
	order_item_id uuid not null references public.merch_order_items(id) on delete cascade,
	partner_provider text not null check (partner_provider in ('manual', 'printful')),
	status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
	external_reference text,
	request_payload jsonb not null default '{}'::jsonb,
	response_payload jsonb not null default '{}'::jsonb,
	error_message text,
	attempts integer not null default 0,
	dispatched_at timestamptz,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now()),
	unique (order_item_id, partner_provider)
);

create index if not exists merch_dispatch_jobs_order_id_idx on public.merch_dispatch_jobs (order_id);

create table if not exists public.merch_refunds (
	id uuid primary key default extensions.uuid_generate_v4(),
	order_id uuid not null references public.merch_orders(id) on delete cascade,
	stripe_refund_id text unique,
	amount_cents integer not null check (amount_cents > 0),
	reason text,
	status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
	created_by_user_id uuid references auth.users(id) on delete set null,
	created_at timestamptz not null default timezone('utc', now())
);

create index if not exists merch_refunds_order_id_idx on public.merch_refunds (order_id, created_at desc);;
