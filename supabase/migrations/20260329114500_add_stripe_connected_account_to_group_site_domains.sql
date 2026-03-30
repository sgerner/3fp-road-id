alter table if exists public.group_site_domain_orders
	add column if not exists stripe_connected_account_id text;

alter table if exists public.group_site_domains
	add column if not exists stripe_connected_account_id text;

create index if not exists group_site_domain_orders_stripe_connected_account_idx
	on public.group_site_domain_orders (stripe_connected_account_id);

create index if not exists group_site_domains_stripe_connected_account_idx
	on public.group_site_domains (stripe_connected_account_id);
