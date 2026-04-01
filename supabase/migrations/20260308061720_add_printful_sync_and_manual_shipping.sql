alter table public.merch_stores
	add column if not exists printful_store_id bigint,
	add column if not exists printful_sync_enabled boolean not null default false,
	add column if not exists printful_last_synced_at timestamptz,
	add column if not exists printful_last_sync_error text;

alter table public.merch_products
	add column if not exists source_of_truth text not null default 'local'
		check (source_of_truth in ('local', 'printful')),
	add column if not exists external_provider text
		check (external_provider in ('printful')),
	add column if not exists external_product_id text,
	add column if not exists external_store_id bigint,
	add column if not exists external_synced_at timestamptz;

create unique index if not exists merch_products_store_external_product_idx
	on public.merch_products (store_id, external_provider, external_product_id)
	where external_provider is not null
		and external_product_id is not null;

alter table public.merch_product_variants
	add column if not exists external_variant_id text,
	add column if not exists catalog_variant_id bigint,
	add column if not exists external_synced_at timestamptz;

create unique index if not exists merch_variants_product_external_variant_idx
	on public.merch_product_variants (product_id, external_variant_id)
	where external_variant_id is not null;

alter table public.merch_fulfillment_methods
	add column if not exists shipping_speed_label text,
	add column if not exists shipping_zone text not null default 'US'
		check (shipping_zone in ('US')),
	add column if not exists rate_rule_mode text not null default 'flat'
		check (rate_rule_mode in ('flat', 'quantity', 'subtotal'));

create table if not exists public.merch_shipping_rules (
	id uuid primary key default extensions.uuid_generate_v4(),
	fulfillment_method_id uuid not null references public.merch_fulfillment_methods(id) on delete cascade,
	metric_type text not null check (metric_type in ('quantity', 'subtotal')),
	min_value integer not null default 0 check (min_value >= 0),
	max_value integer check (max_value is null or max_value >= min_value),
	rate_cents integer not null default 0 check (rate_cents >= 0),
	sort_order integer not null default 0,
	created_at timestamptz not null default timezone('utc', now()),
	updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists merch_shipping_rules_method_sort_idx
	on public.merch_shipping_rules (fulfillment_method_id, sort_order, created_at);

alter table public.merch_orders
	add column if not exists manual_shipping_method_id uuid references public.merch_fulfillment_methods(id) on delete set null,
	add column if not exists manual_shipping_snapshot jsonb not null default '{}'::jsonb,
	add column if not exists manual_shipping_fee_cents integer not null default 0 check (manual_shipping_fee_cents >= 0),
	add column if not exists printful_shipping_option_id text,
	add column if not exists printful_shipping_snapshot jsonb not null default '{}'::jsonb,
	add column if not exists printful_shipping_fee_cents integer not null default 0 check (printful_shipping_fee_cents >= 0),
	add column if not exists shipping_breakdown jsonb not null default '{}'::jsonb;

select
	cron.schedule(
		'merch-sync-printful-hourly',
		'17 * * * *',
		$$
		select
			net.http_post(
				url := 'https://vhrvkhrvdtzgpagcmkzd.supabase.co/functions/v1/merch-sync-printful',
				headers := jsonb_build_object(
					'Content-Type', 'application/json',
					'Authorization',
					'Bearer ' ||
					'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZocnZraHJ2ZHR6Z3BhZ2Nta3pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExNDc0NjUsImV4cCI6MjA1NjcyMzQ2NX0.8Emaw3argivYMjfxlDi_hYnKmoS53LuLQW3-38zYyCk'
				),
				body := jsonb_build_object('trigger', 'cron'),
				timeout_milliseconds := 60000
			)
		$$
	);;
