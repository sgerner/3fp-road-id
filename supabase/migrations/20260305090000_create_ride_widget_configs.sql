create table if not exists public.ride_widget_configs (
	id uuid primary key default uuid_generate_v4(),
	config jsonb not null default '{}'::jsonb,
	created_by_user_id uuid references auth.users(id) on delete set null,
	created_at timestamptz not null default timezone('utc'::text, now()),
	updated_at timestamptz not null default timezone('utc'::text, now()),
	is_active boolean not null default true
);

create index if not exists ride_widget_configs_created_at_idx
	on public.ride_widget_configs (created_at desc);

create index if not exists ride_widget_configs_active_idx
	on public.ride_widget_configs (is_active, created_at desc);

alter table public.ride_widget_configs enable row level security;

drop policy if exists "ride_widget_configs_public_select" on public.ride_widget_configs;
create policy "ride_widget_configs_public_select"
	on public.ride_widget_configs
	for select
	using (is_active = true);
